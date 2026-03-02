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
      const res = await fetch('/whitelist.collaterals.json', {
        headers: { accept: 'application/json' },
      })

      if (!res.ok) {
        // Tolerate missing file on static hosting.
        if (res.status === 404) {
          setState({ status: 'loaded', byChain: {} })
          return
        }
        setState({ status: 'failed', byChain: {} })
        return
      }

      const json = await res.json()
      setState({ status: 'loaded', byChain: buildByChain(json) })
    }
    catch {
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
