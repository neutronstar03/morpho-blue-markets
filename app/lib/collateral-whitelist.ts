import type { DatasetMeta, DatasetMetaSource } from './dataset-cache'
import { useEffect, useSyncExternalStore } from 'react'
import { COLLATERAL_WHITELIST_FRESHNESS_MS, createDatasetCache, useDatasetMeta } from './dataset-cache'

type WhitelistByChain = Record<number, Set<string>>

const CHANGE_EVENT = 'collateral-whitelist:changed'

const LOCAL_URL_PATH = 'whitelist.collaterals.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/whitelist.collaterals.json'

// Keep the current v1 cache key so previously fetched whitelist entries survive
// the lifecycle change.
const LS_CACHE_KEY = 'collateral-whitelist-cache:v1'

function normalizeAddress(address: unknown) {
  const s = typeof address === 'string' ? address.trim().toLowerCase() : ''
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function normalizeEntry(entry: unknown): { chainId: number, address: string } | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    return null
  const e = entry as Record<string, unknown>
  const chainId = Number(e.chainId)
  if (!Number.isSafeInteger(chainId) || chainId <= 0)
    return null
  const addr = normalizeAddress(e.collateralAddress ?? e.address)
  if (!addr)
    return null
  return { chainId, address: addr }
}

// Returns null for a non-array payload so the lifecycle can fall back to cache
// instead of treating a malformed artifact as an empty whitelist. A valid empty
// array is preserved as an empty (but authoritative) whitelist.
function buildByChain(entries: unknown): WhitelistByChain | null {
  if (!Array.isArray(entries))
    return null
  const out: WhitelistByChain = {}
  for (const item of entries) {
    const normalized = normalizeEntry(item)
    if (!normalized)
      return null
    if (!out[normalized.chainId])
      out[normalized.chainId] = new Set<string>()
    out[normalized.chainId].add(normalized.address)
  }
  return out
}

let whitelistVersion = 0

function emitChange() {
  if (typeof window === 'undefined')
    return
  whitelistVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const cache = createDatasetCache<WhitelistByChain>({
  name: 'collateral-whitelist',
  cacheKey: LS_CACHE_KEY,
  localPath: LOCAL_URL_PATH,
  remoteUrl: ARTIFACTS_URL,
  freshnessMs: COLLATERAL_WHITELIST_FRESHNESS_MS,
  parse: buildByChain,
  onChange: emitChange,
})

import.meta.hot?.dispose(() => cache.dispose())

const metaSource: DatasetMetaSource = {
  subscribe: subscribeCollateralWhitelist,
  getVersion: () => whitelistVersion,
  getMeta: () => cache.getMeta(),
}

export function ensureCollateralWhitelistLoaded() {
  cache.ensureLoaded()
}

export function refreshCollateralWhitelistDataset() {
  cache.refresh()
}

export function getCollateralWhitelistVersion() {
  return whitelistVersion
}

export function subscribeCollateralWhitelist(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  return () => window.removeEventListener(CHANGE_EVENT, onEvent)
}

export function useCollateralWhitelistVersion() {
  return useSyncExternalStore(
    subscribeCollateralWhitelist,
    () => getCollateralWhitelistVersion(),
    () => 0,
  )
}

export function useCollateralWhitelistDatasetMeta(): DatasetMeta {
  return useDatasetMeta(metaSource)
}

export function getCollateralWhitelistDatasetMeta(): DatasetMeta {
  return cache.getMeta()
}

export function useCollateralWhitelistPreload() {
  useEffect(() => {
    cache.ensureLoaded()
  }, [])
}

export function isCollateralWhitelisted(chainId?: number, collateralAddress?: string | null) {
  if (chainId == null)
    return false
  const addr = normalizeAddress(collateralAddress)
  if (!addr)
    return false
  const set = cache.getPayload()?.[chainId]
  return set ? set.has(addr) : false
}
