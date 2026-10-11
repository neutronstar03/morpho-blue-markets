import type { DatasetMeta, DatasetMetaSource } from './dataset-cache'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import blacklistAssets from './blacklist.assets.json'
import { baseUrlPrefix, createDatasetCache, localArtifactsEnabled, MARKET_BLACKLIST_FRESHNESS_MS, useDatasetMeta } from './dataset-cache'
import { isCollateralLocallyExcluded, isMarketLocallyMarkedLostValue, isOracleLocallyExcluded, subscribeLocalMarketExclusions } from './local-market-exclusions'
import { isMarketSystemUnhealthy, subscribeUnhealthyMarkets } from './unhealthy-markets'

interface MarketBlacklistArgs {
  uniqueKey?: string | null
  loanAssetAddress?: string | null
  collateralAssetAddress?: string | null
  loanAssetSymbol?: string | null
  collateralAssetSymbol?: string | null
  oracleAddress?: string | null
  chainId?: number
}

type MarketIdsByChain = Record<number, Set<string>>

const CHANGE_EVENT = 'market-blacklist:changed'

const LOCAL_URL_PATH = 'blacklist.markets.json'
const LOCAL_MANUAL_URL_PATH = 'blacklist.markets.manual.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/blacklist.markets.json'

// Keep the current v1 cache key so previously fetched generated entries survive.
const LS_CACHE_KEY = 'market-blacklist-cache:v1'

function normalizeMarketId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

// Returns null for a non-array payload so the lifecycle falls back to cache or
// the previously loaded data instead of clearing known blacklisted markets.
function buildMarketIdsByChain(entries: unknown): MarketIdsByChain | null {
  if (!Array.isArray(entries))
    return null
  const out: MarketIdsByChain = {}
  for (const item of entries) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return null
    const e = item as Record<string, unknown>
    const chainId = Number(e.chainId)
    const uniqueKey = typeof e.uniqueKey === 'string' ? normalizeMarketId(e.uniqueKey) : undefined
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !uniqueKey || !/^0x[a-f0-9]{64}$/.test(uniqueKey))
      return null
    if (!out[chainId])
      out[chainId] = new Set<string>()
    out[chainId].add(uniqueKey)
  }
  return out
}

// Manual entries always win over generated ones: they are merged on top so a
// generated refresh can never drop a local exclusion.
export function mergeMarketIdsByChain(
  ...maps: MarketIdsByChain[]
): MarketIdsByChain {
  const out: MarketIdsByChain = {}
  for (const map of maps) {
    for (const [chainIdRaw, values] of Object.entries(map)) {
      const chainId = Number(chainIdRaw)
      if (!out[chainId])
        out[chainId] = new Set<string>()
      for (const value of values)
        out[chainId].add(value)
    }
  }
  return out
}

let manualMarketIdsByChain: MarketIdsByChain = {}
let manualLoadPromise: Promise<void> | null = null
let mergedMarketIdsByChain: MarketIdsByChain = {}

let blacklistVersion = 0

const cache = createDatasetCache<MarketIdsByChain>({
  name: 'market-blacklist',
  cacheKey: LS_CACHE_KEY,
  localPath: LOCAL_URL_PATH,
  remoteUrl: ARTIFACTS_URL,
  freshnessMs: MARKET_BLACKLIST_FRESHNESS_MS,
  parse: buildMarketIdsByChain,
  onChange: emitChange,
})

import.meta.hot?.dispose(() => cache.dispose())

function recomputeMerged() {
  mergedMarketIdsByChain = mergeMarketIdsByChain(cache.getPayload() ?? {}, manualMarketIdsByChain)
}

function emitChange() {
  recomputeMerged()
  blacklistVersion++
  if (typeof window === 'undefined')
    return
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const metaSource: DatasetMetaSource = {
  subscribe: subscribeMarketBlacklist,
  getVersion: () => blacklistVersion,
  getMeta: () => cache.getMeta(),
}

// The manual file is a dev/static-only overlay. A failed read keeps the
// previous manual entries; it never clears them.
function ensureManualBlacklistLoaded() {
  if (typeof window === 'undefined')
    return
  if (!localArtifactsEnabled())
    return
  if (manualLoadPromise)
    return
  manualLoadPromise = (async () => {
    try {
      const res = await fetch(`${baseUrlPrefix()}${LOCAL_MANUAL_URL_PATH}`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok)
        return
      const contentType = res.headers?.get?.('content-type') ?? ''
      if (contentType.includes('text/html'))
        return
      const parsed = buildMarketIdsByChain(await res.json())
      if (parsed === null)
        return
      manualMarketIdsByChain = parsed
      emitChange()
    }
    catch {
      // keep previously loaded manual entries
    }
  })().finally(() => {
    manualLoadPromise = null
  })
}

export function ensureMarketBlacklistLoaded() {
  cache.ensureLoaded()
  ensureManualBlacklistLoaded()
}

export function refreshMarketBlacklistDataset() {
  cache.refresh()
  ensureManualBlacklistLoaded()
}

export function getMarketBlacklistVersion() {
  return blacklistVersion
}

export function subscribeMarketBlacklist(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  const onDependentChange = () => {
    blacklistVersion++
    listener()
  }
  window.addEventListener(CHANGE_EVENT, onEvent)
  const unsubscribeLocalMarketExclusions = subscribeLocalMarketExclusions(onDependentChange)
  const unsubscribeUnhealthyMarkets = subscribeUnhealthyMarkets(onDependentChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onEvent)
    unsubscribeLocalMarketExclusions()
    unsubscribeUnhealthyMarkets()
  }
}

// React subscription token for module-level blacklist state. Use this to
// recompute local derived values, not as part of remote query keys.
export function useMarketBlacklistVersion() {
  return useSyncExternalStore(
    subscribeMarketBlacklist,
    () => getMarketBlacklistVersion(),
    () => 0,
  )
}

export function useMarketBlacklistDatasetMeta(): DatasetMeta {
  return useDatasetMeta(metaSource)
}

export function getMarketBlacklistDatasetMeta(): DatasetMeta {
  return cache.getMeta()
}

export function useMarketIdBlacklistPredicate() {
  const version = useMarketBlacklistVersion()
  return useMemo(() => {
    void version
    return (uniqueKey?: string | null, chainId?: number) => isMarketIdBlacklisted(uniqueKey, chainId)
  }, [version])
}

export function useFilteredBlacklistedMarkets<T>(
  markets: T[] | undefined,
  getArgs: (market: T) => MarketBlacklistArgs,
) {
  const version = useMarketBlacklistVersion()
  return useMemo(() => {
    void version
    return filterBlacklistedMarkets(markets ?? [], getArgs)
  }, [getArgs, markets, version])
}

export function useMarketBlacklistPreload() {
  useEffect(() => {
    ensureMarketBlacklistLoaded()
  }, [])
}

const BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN: Record<number, Set<string>> = Object.fromEntries(
  Object.entries(blacklistAssets as Record<string, Array<{ assetContract: string }>>).map(
    ([chainId, assets]) => [
      Number(chainId),
      new Set(assets.map(asset => asset.assetContract.toLowerCase())),
    ],
  ),
)

const PENDLE_MONTHS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
}

function normalizeId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

function formatTodayPendleSortable() {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())
  return Number(`${year}${month}${day}`)
}

function parsePendleExpiryFromSymbol(symbol?: string | null) {
  if (!symbol)
    return undefined
  const match = /(?:^|-)(\d{1,2})([A-Z]{3})(\d{4})(?=$|\s|-)/.exec(symbol.toUpperCase())
  if (!match)
    return undefined
  const [, rawDay, monthToken, year] = match
  const month = PENDLE_MONTHS[monthToken]
  if (!month)
    return undefined
  const dayNumber = Number(rawDay)
  if (!Number.isInteger(dayNumber) || dayNumber <= 0 || dayNumber > 31)
    return undefined
  const day = String(dayNumber).padStart(2, '0')
  return Number(`${year}${month}${day}`)
}

function isPendleSymbolExpired(symbol?: string | null) {
  if (!symbol)
    return false
  const normalized = symbol.toUpperCase()
  if (!normalized.startsWith('PT-') && !normalized.startsWith('WRAPPED-LP-'))
    return false
  const expiry = parsePendleExpiryFromSymbol(normalized)
  if (!expiry)
    return false
  return expiry < formatTodayPendleSortable()
}

function normalizeSymbol(symbol?: string | null) {
  return symbol?.trim().toUpperCase() ?? ''
}

const MANUAL_BLACKLISTED_SYMBOLS = new Set([
  'APRUSR',
  'MC-USR',
])

const MANUAL_BLACKLISTED_SYMBOL_PREFIXES = [
  'PT-RLP-',
  'PT-SW-RLP-',
  'PT-USR-',
  'PT-WSTUSR-',
  'LP-USR-',
  'BWPT-USR-',
]

function isManuallyBlacklistedSymbol(symbol?: string | null) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized)
    return false
  if (MANUAL_BLACKLISTED_SYMBOLS.has(normalized))
    return true
  return MANUAL_BLACKLISTED_SYMBOL_PREFIXES.some(prefix => normalized.startsWith(prefix))
}

function hasValueInChainMap(
  map: Record<number, Set<string>>,
  value: string | null | undefined,
  chainId?: number,
) {
  const normalized = normalizeId(value)
  if (!normalized)
    return false
  if (chainId != null) {
    const set = map[chainId]
    return set ? set.has(normalized) : false
  }
  return Object.values(map).some(set => set.has(normalized))
}

export function isAssetBlacklisted(address?: string | null, chainId?: number) {
  return hasValueInChainMap(BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN, address, chainId)
}

export function isMarketIdBlacklisted(uniqueKey?: string | null, chainId?: number) {
  return hasValueInChainMap(mergedMarketIdsByChain, uniqueKey, chainId) || isMarketSystemUnhealthy(uniqueKey, chainId) || isMarketLocallyMarkedLostValue(chainId, uniqueKey)
}

export function isMarketIdManuallyBlacklisted(uniqueKey?: string | null, chainId?: number) {
  return hasValueInChainMap(manualMarketIdsByChain, uniqueKey, chainId)
}

export function isMarketBlacklisted(args: MarketBlacklistArgs) {
  return (
    isMarketIdBlacklisted(args.uniqueKey, args.chainId)
    || isOracleLocallyExcluded(args.chainId, args.oracleAddress)
    || isCollateralLocallyExcluded(args.chainId, args.collateralAssetAddress)
    || isAssetBlacklisted(args.loanAssetAddress, args.chainId)
    || isAssetBlacklisted(args.collateralAssetAddress, args.chainId)
    || isManuallyBlacklistedSymbol(args.loanAssetSymbol)
    || isManuallyBlacklistedSymbol(args.collateralAssetSymbol)
    || isPendleSymbolExpired(args.loanAssetSymbol)
    || isPendleSymbolExpired(args.collateralAssetSymbol)
  )
}

export function filterBlacklistedMarkets<T>(
  markets: T[],
  getArgs: (market: T) => MarketBlacklistArgs,
) {
  return markets.filter(market => !isMarketBlacklisted(getArgs(market)))
}

// Kick off best-effort load early in the client.
if (typeof window !== 'undefined')
  ensureMarketBlacklistLoaded()
