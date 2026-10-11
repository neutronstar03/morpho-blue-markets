import { afterEach, describe, expect, test } from 'bun:test'
import { MORPHO_GRAPHQL_URL } from '../../app/lib/graphql/endpoint'
import { QUERY_POPULAR_LOAN_ASSETS } from '../../app/lib/graphql/queries/popular-loan-assets'
import { onRequestGet } from '../../functions/api/popular-loan-assets'

interface FetchCall {
  url: string
  body: { query: string, variables: Record<string, unknown> }
}

class FakeCache {
  store = new Map<string, Response>()

  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url)?.clone()
  }

  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response.clone())
  }
}

let fetchCalls: FetchCall[]
let cache: FakeCache
let upstream: () => Response
const originalFetch = globalThis.fetch

function install() {
  fetchCalls = []
  cache = new FakeCache()
  ;(globalThis as { caches?: unknown }).caches = { default: cache }
  ;(globalThis as { fetch?: unknown }).fetch = async (input: unknown, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : { query: '', variables: {} }
    fetchCalls.push({ url: String(input), body })
    return upstream()
  }
}

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches
  globalThis.fetch = originalFetch
})

function makeContext(query: string) {
  const pending: Promise<unknown>[] = []
  const context = {
    request: new Request(`https://mbm.test/api/popular-loan-assets?${query}`),
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise) },
  }
  return { context, pending }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

const MARKET_ID = `0x${'1'.repeat(64)}`

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    marketId: MARKET_ID,
    uniqueKey: MARKET_ID,
    loanAsset: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USDCoin',
      decimals: 6,
      chain: { id: 1, network: 'Ethereum' },
      price: { usd: 0.9999 },
    },
    state: { utilization: 0.9, borrowAssetsUsd: 16_896.36, netSupplyApy: 0.386 },
    ...overrides,
  }
}

function envelope(items: unknown[]) {
  return { data: { markets: { items } } }
}

describe('popular-loan-assets edge function', () => {
  test('rejects invalid integer fields and malformed errors without caching them', async () => {
    const item = validItem()
    const invalidPayloads = [
      envelope([{ ...item, loanAsset: { ...item.loanAsset, decimals: 1.5 } }]),
      envelope([{ ...item, loanAsset: { ...item.loanAsset, chain: { id: -1, network: 'Ethereum' } } }]),
      { ...envelope([item]), errors: { message: 'Invalid errors shape' } },
    ]
    for (const payload of invalidPayloads) {
      install()
      upstream = () => jsonResponse(payload)
      const { context, pending } = makeContext('chainId=1')
      const response = await onRequestGet(context as never)
      expect(response.status).toBe(502)
      expect(pending).toHaveLength(0)
      expect(cache.store.size).toBe(0)
    }
  })

  test('sends the shared query and default variables, and returns the normalized envelope', async () => {
    install()
    const item = validItem()
    upstream = () => jsonResponse(envelope([item]))

    const { context, pending } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe(MORPHO_GRAPHQL_URL)
    expect(fetchCalls[0].body.query).toBe(QUERY_POPULAR_LOAN_ASSETS)
    expect(fetchCalls[0].body.variables).toEqual({
      first: 100,
      skip: 0,
      chainId: 1,
      minNetSupplyApy: 0.05,
      maxNetSupplyApy: 10,
      minBorrowUsd: 10_000,
      minUtilization: 0.1,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(envelope([item]))

    await Promise.all(pending)
    expect(cache.store.size).toBe(1)
  })

  test('maps query string filters onto the shared query variables', async () => {
    install()
    upstream = () => jsonResponse(envelope([validItem()]))

    const { context, pending } = makeContext('chainId=8453&first=5&skip=10&minBorrowUsd=250&minNetSupplyApy=0.2&maxNetSupplyApy=3&minUtilization=0.4')
    await onRequestGet(context as never)
    await Promise.all(pending)

    expect(fetchCalls[0].body.variables).toEqual({
      first: 5,
      skip: 10,
      chainId: 8453,
      minNetSupplyApy: 0.2,
      maxNetSupplyApy: 3,
      minBorrowUsd: 250,
      minUtilization: 0.4,
    })
  })

  test('keeps intentional null price and metrics', async () => {
    install()
    const item = validItem({
      loanAsset: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USDCoin',
        decimals: 6,
        chain: { id: 1, network: 'Ethereum' },
        price: null,
      },
      state: { utilization: 0.9, borrowAssetsUsd: null, netSupplyApy: null },
    })
    upstream = () => jsonResponse(envelope([item]))

    const { context, pending } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)
    await Promise.all(pending)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(envelope([item]))
  })

  test('returns 502 and caches nothing on GraphQL errors', async () => {
    install()
    upstream = () => jsonResponse({ errors: [{ message: 'boom' }], data: null })

    const { context, pending } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upstream GraphQL errors' })
    expect(pending).toHaveLength(0)
    expect(cache.store.size).toBe(0)
  })

  test('returns 502 and caches nothing on a malformed top shape', async () => {
    install()
    upstream = () => jsonResponse({ data: { markets: { items: 'nope' } } })

    const { context, pending } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(502)
    expect((await response.json() as { error: string }).error).toContain('Malformed upstream payload')
    expect(pending).toHaveLength(0)
    expect(cache.store.size).toBe(0)
  })

  test('returns 502 and caches nothing when a required item field is missing', async () => {
    install()
    const item = validItem()
    delete (item.state as { utilization?: unknown }).utilization
    upstream = () => jsonResponse(envelope([item]))

    const { context, pending } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(502)
    expect((await response.json() as { error: string }).error).toContain('invalid market item')
    expect(pending).toHaveLength(0)
    expect(cache.store.size).toBe(0)
  })

  test('returns 502 and caches nothing when upstream fails', async () => {
    install()
    upstream = () => jsonResponse({ error: 'down' }, 500)

    const { context } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(502)
    expect(cache.store.size).toBe(0)
  })

  test('serves a cached envelope without calling upstream', async () => {
    install()
    const url = 'https://mbm.test/api/popular-loan-assets?chainId=1'
    cache.store.set(url, jsonResponse(envelope([validItem()])))
    upstream = () => {
      throw new Error('should not fetch')
    }

    const { context } = makeContext('chainId=1')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(200)
    expect(fetchCalls).toHaveLength(0)
  })

  test('rejects a request without chainId', async () => {
    install()
    upstream = () => jsonResponse(envelope([]))

    const { context } = makeContext('first=5')
    const response = await onRequestGet(context as never)

    expect(response.status).toBe(400)
    expect(fetchCalls).toHaveLength(0)
  })
})
