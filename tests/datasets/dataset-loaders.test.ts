import type { DatasetMeta } from '../../app/lib/dataset-cache'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  ensureCollateralWhitelistLoaded,
  getCollateralWhitelistDatasetMeta,
  isCollateralWhitelisted,
  refreshCollateralWhitelistDataset,
} from '../../app/lib/collateral-whitelist'
import { classifyDatasetFreshness } from '../../app/lib/dataset-cache'
import {
  ensureMarketBlacklistLoaded,
  getMarketBlacklistDatasetMeta,
  isMarketIdBlacklisted,
  isMarketIdManuallyBlacklisted,
  refreshMarketBlacklistDataset,
} from '../../app/lib/market-blacklist'
import { getOracleProvider, getOracleProvidersDatasetMeta, refreshOracleProvidersDataset } from '../../app/lib/oracle-providers'
import { getUnhealthyMarketsDatasetMeta, isMarketSystemUnhealthy, refreshUnhealthyMarketsDataset } from '../../app/lib/unhealthy-markets'

const HOUR_MS = 60 * 60 * 1000

const WHITELIST_CACHE_KEY = 'collateral-whitelist-cache:v1'
const BLACKLIST_CACHE_KEY = 'market-blacklist-cache:v1'

const WHITELIST_COLLATERAL = '0xAbC1230000000000000000000000000000000001'
const BLACKLISTED_MARKET = `0x${'d'.repeat(64)}`
const MANUAL_MARKET = `0x${'e'.repeat(64)}`

interface FakeStorage {
  data: Map<string, string>
  localStorage: Storage
}

type RouteHandler = (url: string, init: RequestInit | undefined) => Promise<Response> | Response

let fetchCalls: string[] = []
let routes: Array<{ match: string, handler: RouteHandler }>
const originalFetch = globalThis.fetch

function installBrowser(): FakeStorage {
  const data = new Map<string, string>()
  const localStorage = {
    get length() {
      return data.size
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
  } as unknown as Storage
  ;(globalThis as { window?: unknown }).window = {
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }
  return { data, localStorage }
}

function installRoutes(next: Array<{ match: string, handler: RouteHandler }>) {
  routes = next
  fetchCalls = []
  ;(globalThis as { fetch?: unknown }).fetch = (input: unknown, init?: RequestInit) => {
    const url = String(input)
    fetchCalls.push(url)
    const route = routes.find(candidate => url.endsWith(candidate.match))
    if (!route)
      return Promise.reject(new Error(`No route for ${url}`))
    return Promise.resolve(route.handler(url, init))
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function notFound(): Response {
  return jsonResponse({ error: 'not found' }, 404)
}

async function settle(predicate: () => boolean, timeoutMs = 2000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeoutMs)
      throw new Error('settle timeout')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function isTerminal(meta: DatasetMeta) {
  return (meta.status === 'loaded' || meta.status === 'failed') && !meta.refreshing
}

beforeEach(() => {
  installBrowser()
})

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  globalThis.fetch = originalFetch
  delete (globalThis as { __MBM_LOCAL_ARTIFACTS__?: boolean }).__MBM_LOCAL_ARTIFACTS__
})

describe('collateral whitelist freshness', () => {
  test('keeps a stale whitelist match with an observable age', async () => {
    const cachedAtMs = Date.now() - 100 * HOUR_MS
    const storage = (globalThis as { window?: { localStorage: Storage } }).window!.localStorage
    storage.setItem(WHITELIST_CACHE_KEY, JSON.stringify({
      cachedAtMs,
      entries: [{ chainId: 1, collateralAddress: WHITELIST_COLLATERAL }],
    }))
    installRoutes([{ match: '/whitelist.collaterals.json', handler: notFound }])

    ensureCollateralWhitelistLoaded()
    await settle(() => isTerminal(getCollateralWhitelistDatasetMeta()))

    expect(isCollateralWhitelisted(1, WHITELIST_COLLATERAL)).toBe(true)
    const meta = getCollateralWhitelistDatasetMeta()
    expect(meta.source).toBe('cache')
    expect(meta.observedAtMs).toBe(cachedAtMs)
    expect(classifyDatasetFreshness(meta, Date.now()).level).toBe('stale')
  })
})

describe('market blacklist cache retention', () => {
  test('a 404 keeps the cached v1 restrictions', async () => {
    const storage = (globalThis as { window?: { localStorage: Storage } }).window!.localStorage
    storage.setItem(BLACKLIST_CACHE_KEY, JSON.stringify({
      cachedAtMs: Date.now() - HOUR_MS,
      entries: [{ chainId: 1, uniqueKey: BLACKLISTED_MARKET }],
    }))
    installRoutes([{ match: '/blacklist.markets.json', handler: notFound }])

    ensureMarketBlacklistLoaded()
    await settle(() => isTerminal(getMarketBlacklistDatasetMeta()))

    expect(isMarketIdBlacklisted(BLACKLISTED_MARKET, 1)).toBe(true)
    expect(getMarketBlacklistDatasetMeta().source).toBe('cache')
  })

  test('manual entries survive a failed generated load (dev overlay)', async () => {
    ;(globalThis as { __MBM_LOCAL_ARTIFACTS__?: boolean }).__MBM_LOCAL_ARTIFACTS__ = true
    installRoutes([
      { match: '/blacklist.markets.manual.json', handler: () => jsonResponse([{ chainId: 1, uniqueKey: MANUAL_MARKET }]) },
      { match: '/blacklist.markets.json', handler: notFound },
    ])

    ensureMarketBlacklistLoaded()
    await settle(() => isMarketIdManuallyBlacklisted(MANUAL_MARKET, 1))

    expect(isMarketIdManuallyBlacklisted(MANUAL_MARKET, 1)).toBe(true)
    expect(isMarketIdBlacklisted(MANUAL_MARKET, 1)).toBe(true)
  })
})

describe('valid empty datasets', () => {
  test('an empty whitelist artifact is loaded, not treated as a failure', async () => {
    installRoutes([{ match: '/whitelist.collaterals.json', handler: () => jsonResponse([]) }])

    refreshCollateralWhitelistDataset()
    await settle(() => getCollateralWhitelistDatasetMeta().source === 'remote' && !getCollateralWhitelistDatasetMeta().refreshing)

    expect(isCollateralWhitelisted(1, WHITELIST_COLLATERAL)).toBe(false)
    expect(getCollateralWhitelistDatasetMeta().source).toBe('remote')
  })
})

describe('malformed dataset entries', () => {
  test('a malformed whitelist entry cannot turn known approvals into a fresh empty dataset', async () => {
    installRoutes([{ match: '/whitelist.collaterals.json', handler: () => jsonResponse([{ chainId: 1, address: WHITELIST_COLLATERAL }]) }])
    refreshCollateralWhitelistDataset()
    await settle(() => isTerminal(getCollateralWhitelistDatasetMeta()))
    expect(isCollateralWhitelisted(1, WHITELIST_COLLATERAL)).toBe(true)
    installRoutes([{ match: '/whitelist.collaterals.json', handler: () => jsonResponse([{ chainId: 1, address: 123 }]) }])
    refreshCollateralWhitelistDataset()
    await settle(() => isTerminal(getCollateralWhitelistDatasetMeta()))
    expect(isCollateralWhitelisted(1, WHITELIST_COLLATERAL)).toBe(true)
    expect(getCollateralWhitelistDatasetMeta().error).toBeTruthy()
  })

  test('a malformed blacklist entry cannot clear known restrictions', async () => {
    installRoutes([{ match: '/blacklist.markets.json', handler: () => jsonResponse([{ chainId: 1, uniqueKey: BLACKLISTED_MARKET }]) }])
    refreshMarketBlacklistDataset()
    await settle(() => isTerminal(getMarketBlacklistDatasetMeta()))
    expect(isMarketIdBlacklisted(BLACKLISTED_MARKET, 1)).toBe(true)
    installRoutes([{ match: '/blacklist.markets.json', handler: () => jsonResponse([{}]) }])
    refreshMarketBlacklistDataset()
    await settle(() => isTerminal(getMarketBlacklistDatasetMeta()))
    expect(isMarketIdBlacklisted(BLACKLISTED_MARKET, 1)).toBe(true)
    expect(getMarketBlacklistDatasetMeta().error).toBeTruthy()
  })

  test('malformed unhealthy-market metrics do not drop a known unhealthy market', async () => {
    const entry = {
      chainId: 1,
      uniqueKey: BLACKLISTED_MARKET,
      severity: 'black',
      reason: 'unhealthy_borrowers',
      unhealthyBorrowUsd: 100,
      unhealthyCollateralUsd: 50,
      unhealthyBorrowerCount: 1,
      minHealthFactor: 0.5,
      thresholdUsd: 5,
      generatedAt: '2026-10-10T03:17:00Z',
    }
    installRoutes([{ match: '/unhealthy.markets.json', handler: () => jsonResponse([entry]) }])
    refreshUnhealthyMarketsDataset()
    await settle(() => isTerminal(getUnhealthyMarketsDatasetMeta()))
    expect(isMarketSystemUnhealthy(BLACKLISTED_MARKET, 1)).toBe(true)
    installRoutes([{ match: '/unhealthy.markets.json', handler: () => jsonResponse([{ ...entry, unhealthyBorrowUsd: 'invalid' }]) }])
    refreshUnhealthyMarketsDataset()
    await settle(() => isTerminal(getUnhealthyMarketsDatasetMeta()))
    expect(isMarketSystemUnhealthy(BLACKLISTED_MARKET, 1)).toBe(true)
    expect(getUnhealthyMarketsDatasetMeta().error).toBeTruthy()
  })

  test('oracle metadata keeps publication age separate and retains labels on invalid maps', async () => {
    const generatedAt = '2026-01-01T00:00:00Z'
    const artifact = { version: 1, generatedAt, providersByChain: { 1: { [WHITELIST_COLLATERAL]: 'Chainlink' } } }
    installRoutes([{ match: '/oracle-providers.json', handler: () => jsonResponse(artifact) }])
    refreshOracleProvidersDataset()
    await settle(() => isTerminal(getOracleProvidersDatasetMeta()))
    expect(getOracleProvider(1, WHITELIST_COLLATERAL)).toBe('Chainlink')
    expect(getOracleProvidersDatasetMeta().publishedAtMs).toBe(Date.parse(generatedAt))
    expect(classifyDatasetFreshness(getOracleProvidersDatasetMeta(), Date.now()).level).toBe('fresh')
    installRoutes([{ match: '/oracle-providers.json', handler: () => jsonResponse({ version: 1, providersByChain: [] }) }])
    refreshOracleProvidersDataset()
    await settle(() => isTerminal(getOracleProvidersDatasetMeta()))
    expect(getOracleProvider(1, WHITELIST_COLLATERAL)).toBe('Chainlink')
    expect(getOracleProvidersDatasetMeta().error).toBeTruthy()
  })
})
