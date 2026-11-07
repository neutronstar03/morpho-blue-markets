import { afterEach, expect, mock, test } from 'bun:test'
import { edgeCacheProxy } from '../../functions/api/_cache-utils'

const originalCaches = (globalThis as { caches?: unknown }).caches
afterEach(() => {
  if (originalCaches === undefined)
    delete (globalThis as { caches?: unknown }).caches
  else
    (globalThis as { caches?: unknown }).caches = originalCaches
})

function setup(cache?: unknown) {
  ;(globalThis as { caches?: unknown }).caches = cache ? { default: cache } : undefined
  const pending: Promise<unknown>[] = []
  const fetchUpstream = mock(async () => ({ data: { available: true } }))
  const run = () => edgeCacheProxy({
    requestUrl: 'https://example.test/api/resource',
    waitUntil: promise => pending.push(promise),
    cacheTtlSeconds: 120,
    fetchUpstream,
  })
  return { run, pending, fetchUpstream }
}

test('a cache read outage falls back to upstream instead of failing the request', async () => {
  const put = mock(async () => {})
  const { run, pending, fetchUpstream } = setup({ match: async () => {
    throw new Error('Cache unavailable')
  }, put })
  const response = await run()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ available: true })
  await Promise.all(pending)
  expect(fetchUpstream).toHaveBeenCalledTimes(1)
  expect(put).toHaveBeenCalledTimes(1)
})

test('a cache write outage does not reject background work or lose a valid response', async () => {
  const { run, pending } = setup({ match: async () => undefined, put: async () => {
    throw new Error('Cache full')
  } })
  const response = await run()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ available: true })
  expect(pending).toHaveLength(1)
  await expect(Promise.all(pending)).resolves.toEqual([undefined])
})

test('environments without Cache API still return validated upstream data', async () => {
  const { run, pending } = setup()
  expect((await run()).status).toBe(200)
  await Promise.all(pending)
})

test('cache and upstream outages still return 502 without writing a result', async () => {
  const put = mock(async () => {})
  const { run, pending, fetchUpstream } = setup({ match: async () => {
    throw new Error('Cache unavailable')
  }, put })
  fetchUpstream.mockRejectedValue(new Error('Upstream unavailable'))
  const response = await run()
  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ error: 'Upstream unavailable' })
  expect(pending).toHaveLength(0)
  expect(put).not.toHaveBeenCalled()
})
