import type { DatasetMeta, DatasetMetaSource } from './dataset-cache'
import { useEffect, useSyncExternalStore } from 'react'
import { createDatasetCache, UNHEALTHY_MARKETS_FRESHNESS_MS, useDatasetMeta } from './dataset-cache'

export interface UnhealthyMarketEntry {
  chainId: number
  uniqueKey: string
  severity: 'black'
  reason: 'unhealthy_borrowers'
  unhealthyBorrowUsd: number
  unhealthyCollateralUsd: number
  unhealthyBorrowerCount: number
  minHealthFactor: number
  thresholdUsd: number
  generatedAt: string
  collateralSymbol?: string
  loanSymbol?: string
}

interface UnhealthyMarketsPayload {
  marketIdsByChain: Record<number, Set<string>>
  entriesByKey: Record<string, UnhealthyMarketEntry>
}

const CHANGE_EVENT = 'unhealthy-markets:changed'
const LOCAL_URL_PATH = 'unhealthy.markets.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/unhealthy.markets.json'
// Keep the current v1 cache key so previously flagged markets survive.
const LS_CACHE_KEY = 'unhealthy-markets-cache:v1'

function normalizeMarketId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

// Returns null for a non-array payload so the lifecycle falls back to cache
// instead of clearing previously flagged unhealthy markets.
function buildPayload(entries: unknown): UnhealthyMarketsPayload | null {
  if (!Array.isArray(entries))
    return null

  const marketIdsByChain: Record<number, Set<string>> = {}
  const entriesByKey: Record<string, UnhealthyMarketEntry> = {}

  for (const item of entries) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return null
    const e = item as Record<string, unknown>
    const chainId = Number(e.chainId)
    const uniqueKey = typeof e.uniqueKey === 'string' ? normalizeMarketId(e.uniqueKey) : undefined
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !uniqueKey || !/^0x[a-f0-9]{64}$/.test(uniqueKey)
      || e.severity !== 'black' || e.reason !== 'unhealthy_borrowers'
      || typeof e.generatedAt !== 'string' || !Number.isFinite(Date.parse(e.generatedAt))) {
      return null
    }
    const numericKeys = ['unhealthyBorrowUsd', 'unhealthyCollateralUsd', 'unhealthyBorrowerCount', 'minHealthFactor', 'thresholdUsd'] as const
    const metrics = {} as Record<(typeof numericKeys)[number], number>
    for (const key of numericKeys) {
      const value = e[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        return null
      metrics[key] = value
    }
    if (!Number.isSafeInteger(metrics.unhealthyBorrowerCount))
      return null
    if (!marketIdsByChain[chainId])
      marketIdsByChain[chainId] = new Set<string>()
    marketIdsByChain[chainId].add(uniqueKey)
    entriesByKey[`${chainId}:${uniqueKey}`] = {
      chainId,
      uniqueKey,
      severity: 'black',
      reason: 'unhealthy_borrowers',
      ...metrics,
      generatedAt: e.generatedAt,
      collateralSymbol: typeof e.collateralSymbol === 'string' ? e.collateralSymbol : undefined,
      loanSymbol: typeof e.loanSymbol === 'string' ? e.loanSymbol : undefined,
    }
  }

  return { marketIdsByChain, entriesByKey }
}

const EMPTY_PAYLOAD: UnhealthyMarketsPayload = { marketIdsByChain: {}, entriesByKey: {} }

let unhealthyMarketsVersion = 0

function emitChange() {
  if (typeof window === 'undefined')
    return
  unhealthyMarketsVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const cache = createDatasetCache<UnhealthyMarketsPayload>({
  name: 'unhealthy-markets',
  cacheKey: LS_CACHE_KEY,
  localPath: LOCAL_URL_PATH,
  remoteUrl: ARTIFACTS_URL,
  freshnessMs: UNHEALTHY_MARKETS_FRESHNESS_MS,
  parse: buildPayload,
  onChange: emitChange,
})

import.meta.hot?.dispose(() => cache.dispose())

const metaSource: DatasetMetaSource = {
  subscribe: subscribeUnhealthyMarkets,
  getVersion: () => unhealthyMarketsVersion,
  getMeta: () => cache.getMeta(),
}

export function ensureUnhealthyMarketsLoaded() {
  cache.ensureLoaded()
}

export function refreshUnhealthyMarketsDataset() {
  cache.refresh()
}

export function getUnhealthyMarketsVersion() {
  return unhealthyMarketsVersion
}

export function subscribeUnhealthyMarkets(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  return () => window.removeEventListener(CHANGE_EVENT, onEvent)
}

export function useUnhealthyMarketsVersion() {
  return useSyncExternalStore(
    subscribeUnhealthyMarkets,
    () => getUnhealthyMarketsVersion(),
    () => 0,
  )
}

export function useUnhealthyMarketsDatasetMeta(): DatasetMeta {
  return useDatasetMeta(metaSource)
}

export function getUnhealthyMarketsDatasetMeta(): DatasetMeta {
  return cache.getMeta()
}

export function useUnhealthyMarketsPreload() {
  useEffect(() => {
    cache.ensureLoaded()
  }, [])
}

function hasValueInChainMap(
  map: Record<number, Set<string>>,
  value: string | null | undefined,
  chainId?: number,
) {
  const normalized = normalizeMarketId(value)
  if (!normalized)
    return false
  if (chainId != null) {
    const set = map[chainId]
    return set ? set.has(normalized) : false
  }
  return Object.values(map).some(set => set.has(normalized))
}

export function isMarketSystemUnhealthy(uniqueKey?: string | null, chainId?: number) {
  const payload = cache.getPayload() ?? EMPTY_PAYLOAD
  return hasValueInChainMap(payload.marketIdsByChain, uniqueKey, chainId)
}

export function getMarketSystemUnhealthyEntry(uniqueKey?: string | null, chainId?: number) {
  const normalized = normalizeMarketId(uniqueKey)
  if (!normalized || chainId == null)
    return undefined
  return cache.getPayload()?.entriesByKey[`${chainId}:${normalized}`]
}

if (typeof window !== 'undefined')
  ensureUnhealthyMarketsLoaded()
