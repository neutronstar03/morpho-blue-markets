import { useEffect, useSyncExternalStore } from 'react'

interface WhitelistEntry {
  chainId: number
  collateralAddress?: string
  address?: string
}

type WhitelistStatus = 'uninitialized' | 'loading' | 'loaded' | 'failed'

interface WhitelistState {
  status: WhitelistStatus
  byChain: Record<number, Set<string>>
}

const CHANGE_EVENT = 'collateral-whitelist:changed'

const LOCAL_URL_PATH = 'whitelist.collaterals.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/whitelist.collaterals.json'

const LS_CACHE_KEY = 'collateral-whitelist-cache:v1'

let whitelistVersion = 0
let whitelistState: WhitelistState = {
  status: 'uninitialized',
  byChain: {},
}

function normalizeAddress(address?: string | null) {
  const s = (address ?? '').trim().toLowerCase()
  return s && s.startsWith('0x') ? s : ''
}

function normalizeEntry(entry: unknown): { chainId: number, address: string } | null {
  if (!entry || typeof entry !== 'object')
    return null
  const e = entry as Partial<WhitelistEntry>
  const chainId = Number(e.chainId)
  if (!Number.isFinite(chainId) || chainId <= 0)
    return null
  const addr = normalizeAddress(e.collateralAddress ?? e.address)
  if (!addr)
    return null
  return { chainId, address: addr }
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  whitelistVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function setState(next: WhitelistState) {
  whitelistState = next
  emitChange()
}

function buildByChain(entries: unknown) {
  const out: Record<number, Set<string>> = {}
  const arr = Array.isArray(entries) ? entries : []
  for (const item of arr) {
    const normalized = normalizeEntry(item)
    if (!normalized)
      continue
    if (!out[normalized.chainId])
      out[normalized.chainId] = new Set<string>()
    out[normalized.chainId].add(normalized.address)
  }
  return out
}

let loadPromise: Promise<void> | null = null

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

async function fetchWhitelist(url: string) {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  })
  return res
}

export function ensureCollateralWhitelistLoaded() {
  if (typeof window === 'undefined')
    return
  if (whitelistState.status === 'loaded' || whitelistState.status === 'failed')
    return
  if (loadPromise)
    return

  setState({ ...whitelistState, status: 'loading' })
  loadPromise = (async () => {
    try {
      // First try a local static file (supports local pull/generate workflows).
      const localUrl = `${baseUrlPrefix()}${LOCAL_URL_PATH}`
      const localRes = await fetchWhitelist(localUrl)

      if (localRes.ok) {
        const json = await localRes.json()
        safeWriteCache(json)
        setState({ status: 'loaded', byChain: buildByChain(json) })
        return
      }

      // If the local file is missing, fall back to the canonical published dataset.
      if (localRes.status === 404) {
        const artifactsRes = await fetchWhitelist(ARTIFACTS_URL)
        if (artifactsRes.ok) {
          const json = await artifactsRes.json()
          safeWriteCache(json)
          setState({ status: 'loaded', byChain: buildByChain(json) })
          return
        }

        // Artifacts can be missing during rollout. Treat as empty.
        if (artifactsRes.status === 404) {
          setState({ status: 'loaded', byChain: {} })
          return
        }
      }

      // Last resort: use cached data if present, otherwise fall back to empty.
      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', byChain: buildByChain(cached) })
        return
      }

      setState({ status: 'failed', byChain: {} })
    }
    catch {
      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', byChain: buildByChain(cached) })
        return
      }
      setState({ status: 'failed', byChain: {} })
    }
  })().finally(() => {
    loadPromise = null
  })
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

export function useCollateralWhitelistPreload() {
  useEffect(() => {
    ensureCollateralWhitelistLoaded()
  }, [])
}

export function isCollateralWhitelisted(chainId?: number, collateralAddress?: string | null) {
  if (chainId == null)
    return false
  const addr = normalizeAddress(collateralAddress)
  if (!addr)
    return false
  const set = whitelistState.byChain[chainId]
  return set ? set.has(addr) : false
}
