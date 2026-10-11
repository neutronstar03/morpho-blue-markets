import type { DatasetCache } from '../../app/lib/dataset-cache'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { classifyDatasetFreshness, createDatasetCache } from '../../app/lib/dataset-cache'

const HOUR_MS = 60 * 60 * 1000

interface BrowserHarness {
  storage: Map<string, string>
}

let harness: BrowserHarness
let liveCaches: DatasetCache<unknown>[]
const originalFetch = globalThis.fetch

function installBrowser(): BrowserHarness {
  const storage = new Map<string, string>()
  const events = new EventTarget()
  const win = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value))
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  }
  ;(globalThis as { window?: unknown }).window = win
  return { storage }
}

type FetchHandler = (url: string, init: RequestInit | undefined, call: number) => Promise<Response> | Response

let fetchCalls: string[] = []

function installFetch(handler: FetchHandler) {
  fetchCalls = []
  ;(globalThis as { fetch?: unknown }).fetch = (input: unknown, init?: RequestInit) => {
    const url = String(input)
    fetchCalls.push(url)
    return Promise.resolve(handler(url, init, fetchCalls.length))
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function htmlResponse(status = 200): Response {
  return new Response('<html>not json</html>', {
    status,
    headers: { 'content-type': 'text/html' },
  })
}

function stalledResponse(init: RequestInit | undefined): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    const signal = init?.signal
    if (!signal)
      return
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
}

function createTestCache(overrides: Partial<Parameters<typeof createDatasetCache<string[]>>[0]> = {}) {
  const cache = createDatasetCache<string[]>({
    name: 'test-dataset',
    cacheKey: 'test-dataset-cache:v1',
    localPath: 'test.local.json',
    remoteUrl: 'https://example.test/v1/test.json',
    freshnessMs: 48 * HOUR_MS,
    parse: input => (Array.isArray(input) ? input.map(String) : null),
    retryBaseMs: 60_000,
    ...overrides,
  })
  liveCaches.push(cache as DatasetCache<unknown>)
  return cache
}

async function settle(predicate: () => boolean, timeoutMs = 1500) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('settle timeout')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function seedCache(key: string, stored: Record<string, unknown>) {
  harness.storage.set(key, JSON.stringify(stored))
}

beforeEach(() => {
  harness = installBrowser()
  liveCaches = []
})

afterEach(() => {
  for (const cache of liveCaches)
    cache.dispose()
  delete (globalThis as { window?: unknown }).window
  globalThis.fetch = originalFetch
  delete (globalThis as { __MBM_LOCAL_ARTIFACTS__?: boolean }).__MBM_LOCAL_ARTIFACTS__
})

describe('dataset cache lifecycle', () => {
  test('a 404 keeps the existing v1 cache entry instead of clearing restrictions', async () => {
    const cachedAtMs = Date.now() - HOUR_MS
    seedCache('test-dataset-cache:v1', { cachedAtMs, entries: ['0xaaa', '0xbbb'] })
    installFetch(() => jsonResponse({ error: 'missing' }, 404))

    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded' && !cache.getMeta().refreshing)

    expect(cache.getPayload()).toEqual(['0xaaa', '0xbbb'])
    expect(cache.getMeta().source).toBe('cache')
    expect(cache.getMeta().cachedAtMs).toBe(cachedAtMs)
    expect(cache.getMeta().error).toBeTruthy()
  })

  test('a malformed payload keeps the previously loaded data', async () => {
    installFetch(() => jsonResponse(['0xaaa']))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['0xaaa'])

    // Drop the cache so this exercises the in-memory retain path.
    harness.storage.clear()
    installFetch(() => htmlResponse())
    cache.refresh()
    await settle(() => cache.getMeta().status === 'loaded' && cache.getMeta().refreshing === false)

    expect(cache.getPayload()).toEqual(['0xaaa'])
    expect(cache.getMeta().source).toBe('remote')
    expect(cache.getMeta().error).toBeTruthy()
  })

  test('an invalid top-level payload does not replace known data with empty', async () => {
    installFetch(() => jsonResponse(['0xaaa']))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded')

    harness.storage.clear()
    installFetch(() => jsonResponse({ entries: ['0xbbb'] }))
    cache.refresh()
    await settle(() => cache.getMeta().status === 'loaded' && cache.getMeta().refreshing === false)

    expect(cache.getPayload()).toEqual(['0xaaa'])
  })

  test('a valid empty payload legitimately clears the dataset', async () => {
    installFetch(() => jsonResponse([]))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded')

    expect(cache.getPayload()).toEqual([])
    expect(cache.getMeta().status).toBe('loaded')
    expect(cache.getMeta().source).toBe('remote')
    expect(cache.getMeta().error).toBeNull()
  })

  test('classifies fresh vs stale from the acquisition time', async () => {
    installFetch(() => jsonResponse(['0xaaa']))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded')

    const now = Date.now()
    expect(classifyDatasetFreshness(cache.getMeta(), now).level).toBe('fresh')
    expect(classifyDatasetFreshness(cache.getMeta(), now + 72 * HOUR_MS).level).toBe('stale')
  })

  test('a cache entry without a valid timestamp is stale', async () => {
    seedCache('test-dataset-cache:v1', { entries: ['0xaaa'] })
    installFetch(() => jsonResponse({ error: 'missing' }, 404))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'loaded')

    expect(cache.getPayload()).toEqual(['0xaaa'])
    expect(cache.getMeta().cachedAtMs).toBeNull()
    expect(cache.getMeta().observedAtMs).toBeNull()
    expect(classifyDatasetFreshness(cache.getMeta(), Date.now()).level).toBe('stale')
  })

  test('deduplicates concurrent loads into a single fetch', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    installFetch(async () => {
      await gate
      return jsonResponse(['0xaaa'])
    })

    const cache = createTestCache()
    cache.ensureLoaded()
    cache.ensureLoaded()
    cache.refresh()

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(fetchCalls.length).toBe(1)
    release?.()
    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['0xaaa'])
  })

  test('recovers from a failed load through the bounded retry', async () => {
    installFetch(() => jsonResponse({ error: 'boom' }, 500))
    const cache = createTestCache({ retryBaseMs: 20 })
    cache.ensureLoaded()
    await settle(() => cache.getMeta().nextRetryAtMs !== null && cache.getMeta().refreshing === false)
    expect(cache.getPayload()).toBeNull()
    expect(cache.getMeta().status).toBe('failed')

    installFetch(() => jsonResponse(['0xccc']))
    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['0xccc'])
    expect(cache.getMeta().error).toBeNull()
  })

  test('a stalled request times out and a later retry succeeds', async () => {
    let attempts = 0
    installFetch((_url, init) => {
      attempts++
      if (attempts === 1)
        return stalledResponse(init)
      return jsonResponse(['0xddd'])
    })

    const cache = createTestCache({ timeoutMs: 30, retryBaseMs: 60 })
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'failed')
    expect(cache.getPayload()).toBeNull()

    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['0xddd'])
  })

  test('applies cached restrictions immediately while a remote refresh is pending', async () => {
    seedCache('test-dataset-cache:v1', { cachedAtMs: Date.now(), entries: ['known-restriction'] })
    let release: (response: Response) => void = () => {}
    const gate = new Promise<Response>((resolve) => {
      release = resolve
    })
    installFetch(() => gate)
    const cache = createTestCache()
    cache.ensureLoaded()
    expect(cache.getPayload()).toEqual(['known-restriction'])
    expect(cache.getMeta().refreshing).toBe(true)
    release(jsonResponse(['updated-restriction']))
    await settle(() => !cache.getMeta().refreshing)
    expect(cache.getPayload()).toEqual(['updated-restriction'])
  })

  test('does not replace newer in-memory restrictions with an older cache after a storage failure', async () => {
    seedCache('test-dataset-cache:v1', { cachedAtMs: Date.now() - HOUR_MS, entries: ['older'] })
    window.localStorage.setItem = () => {
      throw new Error('Storage quota exceeded')
    }
    installFetch(() => jsonResponse(['newer']))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => !cache.getMeta().refreshing)
    expect(cache.getPayload()).toEqual(['newer'])
    expect(cache.getMeta().cachedAtMs).toBeNull()
    installFetch(() => jsonResponse({}, 404))
    cache.refresh()
    await settle(() => !cache.getMeta().refreshing)
    expect(cache.getPayload()).toEqual(['newer'])
  })

  test('times out a stalled JSON body even after response headers arrive', async () => {
    installFetch((_url, init, call) => {
      if (call > 1)
        return jsonResponse(['recovered'])
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('['))
          init?.signal?.addEventListener('abort', () => controller.error(new Error('Body aborted')), { once: true })
        },
      })
      return new Response(body, { headers: { 'content-type': 'application/json' } })
    })
    const cache = createTestCache({ timeoutMs: 30, retryBaseMs: 100 })
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'failed')
    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['recovered'])
  })

  test('retries on reconnect and disposal removes the reconnect listener', async () => {
    installFetch(() => jsonResponse({}, 500))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().status === 'failed')
    installFetch(() => jsonResponse(['online']))
    window.dispatchEvent(new Event('online'))
    await settle(() => cache.getMeta().status === 'loaded')
    expect(cache.getPayload()).toEqual(['online'])
    cache.dispose()
    window.dispatchEvent(new Event('online'))
    cache.refresh()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(fetchCalls).toHaveLength(1)
  })

  test('honors retry backoff when stale data consumers call ensureLoaded repeatedly', async () => {
    seedCache('test-dataset-cache:v1', { cachedAtMs: Date.now() - 100 * HOUR_MS, entries: ['known'] })
    installFetch(() => jsonResponse({}, 500))
    const cache = createTestCache()
    cache.ensureLoaded()
    await settle(() => cache.getMeta().nextRetryAtMs !== null)
    for (let i = 0; i < 10; i++)
      cache.ensureLoaded()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(fetchCalls).toHaveLength(1)
    expect(cache.getPayload()).toEqual(['known'])
  })
})
