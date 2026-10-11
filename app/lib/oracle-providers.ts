import type { DatasetMeta, DatasetMetaSource } from './dataset-cache'
import { useEffect, useSyncExternalStore } from 'react'
import { createDatasetCache, ORACLE_PROVIDERS_FRESHNESS_MS, useDatasetMeta } from './dataset-cache'

type ProvidersByChain = Record<number, Record<string, string>>

const CHANGE_EVENT = 'oracle-providers:changed'

const LOCAL_URL_PATH = 'oracle-providers.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/oracle-providers.json'

// Keep the current v1 cache key so previously fetched provider labels survive.
const LS_CACHE_KEY = 'oracle-providers-cache:v1'

function normalizeAddress(address?: string | null) {
  const s = (address ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

// The published artifact is the only valid shape; anything without a
// providersByChain map is treated as invalid so we keep the cached/previous
// labels instead of blanking them out. An empty map is preserved as valid.
function buildProvidersByChain(input: unknown): ProvidersByChain | null {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return null
  const artifact = input as Record<string, unknown>
  const source = artifact.providersByChain
  if (!Number.isSafeInteger(artifact.version) || Number(artifact.version) <= 0
    || !source || typeof source !== 'object' || Array.isArray(source)) {
    return null
  }

  const out: ProvidersByChain = {}
  for (const [chainIdRaw, providers] of Object.entries(source)) {
    const chainId = Number(chainIdRaw)
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !providers || typeof providers !== 'object' || Array.isArray(providers))
      return null

    const normalizedProviders: Record<string, string> = {}
    for (const [addressRaw, labelRaw] of Object.entries(providers)) {
      const address = normalizeAddress(addressRaw)
      const label = typeof labelRaw === 'string' ? labelRaw.trim() : ''
      if (!address || !label)
        return null
      normalizedProviders[address] = label
    }

    if (Object.keys(normalizedProviders).length > 0)
      out[chainId] = normalizedProviders
  }

  return out
}

// generatedAt reflects the last content change, not the last publisher run, so
// it is surfaced as informational publication time only.
function publishedAtFromArtifact(input: unknown): number | null {
  const generatedAt = input && typeof input === 'object' && 'generatedAt' in input ? input.generatedAt : undefined
  if (typeof generatedAt !== 'string')
    return null
  const parsed = Date.parse(generatedAt)
  return Number.isFinite(parsed) ? parsed : null
}

let oracleProvidersVersion = 0

function emitChange() {
  if (typeof window === 'undefined')
    return
  oracleProvidersVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const cache = createDatasetCache<ProvidersByChain>({
  name: 'oracle-providers',
  cacheKey: LS_CACHE_KEY,
  localPath: LOCAL_URL_PATH,
  remoteUrl: ARTIFACTS_URL,
  freshnessMs: ORACLE_PROVIDERS_FRESHNESS_MS,
  payloadField: 'artifact',
  parse: buildProvidersByChain,
  getPublishedAtMs: publishedAtFromArtifact,
  onChange: emitChange,
})

import.meta.hot?.dispose(() => cache.dispose())

const metaSource: DatasetMetaSource = {
  subscribe: subscribeOracleProviders,
  getVersion: () => oracleProvidersVersion,
  getMeta: () => cache.getMeta(),
}

export function ensureOracleProvidersLoaded() {
  cache.ensureLoaded()
}

export function refreshOracleProvidersDataset() {
  cache.refresh()
}

export function getOracleProvidersVersion() {
  return oracleProvidersVersion
}

export function subscribeOracleProviders(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  return () => window.removeEventListener(CHANGE_EVENT, onEvent)
}

export function useOracleProvidersVersion() {
  return useSyncExternalStore(
    subscribeOracleProviders,
    () => getOracleProvidersVersion(),
    () => 0,
  )
}

export function useOracleProvidersDatasetMeta(): DatasetMeta {
  return useDatasetMeta(metaSource)
}

export function getOracleProvidersDatasetMeta(): DatasetMeta {
  return cache.getMeta()
}

export function useOracleProvidersPreload() {
  useEffect(() => {
    cache.ensureLoaded()
  }, [])
}

export function getOracleProvider(chainId?: number, oracleAddress?: string | null) {
  if (chainId == null)
    return undefined
  const address = normalizeAddress(oracleAddress)
  if (!address)
    return undefined
  return cache.getPayload()?.[chainId]?.[address]
}
