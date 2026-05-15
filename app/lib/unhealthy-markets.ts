import { useEffect, useSyncExternalStore } from 'react'

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

type UnhealthyMarketsStatus = 'uninitialized' | 'loading' | 'loaded' | 'failed'

interface UnhealthyMarketsState {
  status: UnhealthyMarketsStatus
  marketIdsByChain: Record<number, Set<string>>
  entriesByKey: Record<string, UnhealthyMarketEntry>
}

const CHANGE_EVENT = 'unhealthy-markets:changed'
const LOCAL_URL_PATH = 'unhealthy.markets.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/unhealthy.markets.json'
const LS_CACHE_KEY = 'unhealthy-markets-cache:v1'

let unhealthyMarketsVersion = 0
let unhealthyMarketsState: UnhealthyMarketsState = {
  status: 'uninitialized',
  marketIdsByChain: {},
  entriesByKey: {},
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  unhealthyMarketsVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function setState(next: UnhealthyMarketsState) {
  unhealthyMarketsState = next
  emitChange()
}

function normalizeMarketId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

function buildState(entries: unknown): Omit<UnhealthyMarketsState, 'status'> {
  const marketIdsByChain: Record<number, Set<string>> = {}
  const entriesByKey: Record<string, UnhealthyMarketEntry> = {}
  const arr = Array.isArray(entries) ? entries : []

  for (const item of arr) {
    if (!item || typeof item !== 'object')
      continue
    const e = item as Partial<UnhealthyMarketEntry>
    const chainId = Number(e.chainId)
    const uniqueKey = normalizeMarketId(e.uniqueKey)
    if (!Number.isFinite(chainId) || chainId <= 0 || !uniqueKey)
      continue
    if (!marketIdsByChain[chainId])
      marketIdsByChain[chainId] = new Set<string>()
    marketIdsByChain[chainId].add(uniqueKey)
    entriesByKey[`${chainId}:${uniqueKey}`] = {
      chainId,
      uniqueKey,
      severity: 'black',
      reason: 'unhealthy_borrowers',
      unhealthyBorrowUsd: Number(e.unhealthyBorrowUsd) || 0,
      unhealthyCollateralUsd: Number(e.unhealthyCollateralUsd) || 0,
      unhealthyBorrowerCount: Number(e.unhealthyBorrowerCount) || 0,
      minHealthFactor: Number(e.minHealthFactor) || 0,
      thresholdUsd: Number(e.thresholdUsd) || 0,
      generatedAt: typeof e.generatedAt === 'string' ? e.generatedAt : '',
      collateralSymbol: typeof e.collateralSymbol === 'string' ? e.collateralSymbol : undefined,
      loanSymbol: typeof e.loanSymbol === 'string' ? e.loanSymbol : undefined,
    }
  }

  return { marketIdsByChain, entriesByKey }
}

function safeReadCache(): unknown | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as any
    return parsed?.entries
  }
  catch {
    return undefined
  }
}

function safeWriteCache(entries: unknown) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
      cachedAtMs: Date.now(),
      entries,
    }))
  }
  catch {
    // ignore
  }
}

function baseUrlPrefix() {
  const base = (import.meta as any).env?.BASE_URL as string | undefined
  return base && typeof base === 'string' ? base : '/'
}

function shouldTryLocalStaticFile() {
  return Boolean((import.meta as any).env?.DEV)
}

async function fetchJson(url: string) {
  return fetch(url, { headers: { accept: 'application/json' } })
}

async function readJsonResponse(res: Response) {
  if (!res.ok)
    return undefined
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('text/html'))
    return undefined
  try {
    return await res.json()
  }
  catch {
    return undefined
  }
}

let loadPromise: Promise<void> | null = null

export function ensureUnhealthyMarketsLoaded() {
  if (typeof window === 'undefined')
    return
  if (unhealthyMarketsState.status === 'loaded' || unhealthyMarketsState.status === 'failed')
    return
  if (loadPromise)
    return

  setState({ ...unhealthyMarketsState, status: 'loading' })
  loadPromise = (async () => {
    try {
      const localRes = shouldTryLocalStaticFile()
        ? await fetchJson(`${baseUrlPrefix()}${LOCAL_URL_PATH}`)
        : undefined
      const localJson = localRes ? await readJsonResponse(localRes) : undefined
      if (localJson !== undefined) {
        safeWriteCache(localJson)
        setState({ status: 'loaded', ...buildState(localJson) })
        return
      }

      if (!localRes || localRes.status === 404 || localRes.ok) {
        const artifactsRes = await fetchJson(ARTIFACTS_URL)
        const artifactsJson = await readJsonResponse(artifactsRes)
        if (artifactsJson !== undefined) {
          safeWriteCache(artifactsJson)
          setState({ status: 'loaded', ...buildState(artifactsJson) })
          return
        }

        if (artifactsRes.status === 404) {
          setState({ status: 'loaded', marketIdsByChain: {}, entriesByKey: {} })
          return
        }
      }

      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', ...buildState(cached) })
        return
      }

      setState({ status: 'failed', marketIdsByChain: {}, entriesByKey: {} })
    }
    catch {
      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', ...buildState(cached) })
        return
      }
      setState({ status: 'failed', marketIdsByChain: {}, entriesByKey: {} })
    }
  })().finally(() => {
    loadPromise = null
  })
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

export function useUnhealthyMarketsPreload() {
  useEffect(() => {
    ensureUnhealthyMarketsLoaded()
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
  return hasValueInChainMap(unhealthyMarketsState.marketIdsByChain, uniqueKey, chainId)
}

export function getMarketSystemUnhealthyEntry(uniqueKey?: string | null, chainId?: number) {
  const normalized = normalizeMarketId(uniqueKey)
  if (!normalized || chainId == null)
    return undefined
  return unhealthyMarketsState.entriesByKey[`${chainId}:${normalized}`]
}

if (typeof window !== 'undefined')
  ensureUnhealthyMarketsLoaded()
