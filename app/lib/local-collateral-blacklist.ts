import { useSyncExternalStore } from 'react'

interface LocalCollateralBlacklistEntry {
  ts: number
}

const KEY_PREFIX = 'local-collateral-blacklist:v1:'
const CHANGE_EVENT = 'local-collateral-blacklist:changed'

let localCollateralBlacklistVersion = 0

function normalizeAddress(address?: string | null) {
  return (address ?? '').trim().toLowerCase()
}

function makeKey(chainId: number, collateralAddress: string) {
  return `${KEY_PREFIX}${chainId}:${normalizeAddress(collateralAddress)}`
}

function safeRead(key: string): LocalCollateralBlacklistEntry | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as Partial<LocalCollateralBlacklistEntry>
    return {
      ts: typeof parsed?.ts === 'number' ? parsed.ts : 0,
    }
  }
  catch {
    return undefined
  }
}

function safeWrite(key: string, value: LocalCollateralBlacklistEntry | undefined) {
  if (typeof window === 'undefined')
    return
  try {
    if (!value) {
      window.localStorage.removeItem(key)
    }
    else {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  }
  catch {
    // ignore storage errors
  }
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  localCollateralBlacklistVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getLocalCollateralBlacklistVersion() {
  return localCollateralBlacklistVersion
}

export function isCollateralLocallyBlacklisted(chainId?: number, collateralAddress?: string | null) {
  if (chainId == null || !collateralAddress)
    return false
  return safeRead(makeKey(chainId, collateralAddress)) != null
}

export function setCollateralLocallyBlacklisted(chainId: number, collateralAddress: string) {
  safeWrite(makeKey(chainId, collateralAddress), { ts: Date.now() })
  emitChange()
}

export function clearCollateralLocallyBlacklisted(chainId: number, collateralAddress: string) {
  safeWrite(makeKey(chainId, collateralAddress), undefined)
  emitChange()
}

export function subscribeLocalCollateralBlacklist(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  const onEvent = () => listener()
  const onStorage = (e: StorageEvent) => {
    if (!e.key)
      return
    if (e.key.startsWith(KEY_PREFIX)) {
      localCollateralBlacklistVersion++
      listener()
    }
  }

  window.addEventListener(CHANGE_EVENT, onEvent)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onEvent)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLocalCollateralBlacklistVersion() {
  return useSyncExternalStore(
    subscribeLocalCollateralBlacklist,
    () => getLocalCollateralBlacklistVersion(),
    () => 0,
  )
}
