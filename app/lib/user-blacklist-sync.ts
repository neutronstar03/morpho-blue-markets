// Orchestrates wallet-authenticated sync between local blacklist preferences and the backend blob.
import { useEffect, useSyncExternalStore } from 'react'
import {
  clearCollateralLocallyExcludedWithTimestamp,
  clearMarketLocallyMarkedLostValueWithTimestamp,
  clearOracleLocallyExcludedWithTimestamp,
  listLocalCollateralExclusionSyncRecords,
  listLocalMarketLostValueSyncRecords,
  listLocalOracleExclusionSyncRecords,
  setCollateralLocallyExcludedWithTimestamp,
  setMarketLocallyMarkedLostValueWithTimestamp,
  setOracleLocallyExcludedWithTimestamp,
  subscribeLocalMarketExclusions,
} from './local-market-exclusions'

interface SyncCollateralEntry {
  t: number
  s?: string
  n?: string
  d?: true
}

interface SyncMarketEntry {
  t: number
  ls?: string
  cs?: string
  la?: string
  ca?: string
  d?: true
}

interface SyncOracleEntry {
  t: number
  p?: string
  cs?: string
  d?: true
}

export interface UserBlacklistBlob {
  // Compact KV shape: c=collaterals, o=oracles, w=lost-value writeoffs; u=blob timestamp; t=entry timestamp; d=deleted tombstone.
  v: 1
  u: number
  c: Record<string, Record<string, SyncCollateralEntry>>
  o: Record<string, Record<string, SyncOracleEntry>>
  w: Record<string, Record<string, SyncMarketEntry>>
}

export interface UserBlacklistSyncState {
  enabled: boolean
  busy: boolean
  lastSyncAt?: number
  error?: string
}

const TOKEN_PREFIX = 'user-blacklist-sync-token:v1:'
const STATUS_PREFIX = 'user-blacklist-sync-status:v1:'
const CHANGE_EVENT = 'user-blacklist-sync:changed'
const API_PATH = '/api/user-blacklist'

// Module-level mutable state: the background push listener is a singleton that outlives
// React re-renders, so it lives outside any component tree. activeWallet is set by
// useEffect below; unsubscribeLocal prevents double-subscription across remounts.
let activeWallet: string | undefined
let unsubscribeLocal: (() => void) | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let isApplyingRemoteBlob = false
const volatileStatusByWallet = new Map<string, Pick<UserBlacklistSyncState, 'busy' | 'error'>>()
let lastSnapshotWallet: string | undefined
let lastSnapshotSignature = ''
let lastSnapshot: UserBlacklistSyncState = { enabled: false, busy: false }

// Focus-based background sync guards
let lastBackgroundSyncAt = 0
let tabHiddenAt = 0
const MIN_HIDDEN_MS = 30_000
const SYNC_COOLDOWN_MS = 60_000

function normalizeWallet(wallet?: string | null) {
  const normalized = (wallet ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : undefined
}

function tokenKey(wallet: string) {
  return `${TOKEN_PREFIX}${wallet}`
}

function statusKey(wallet: string) {
  return `${STATUS_PREFIX}${wallet}`
}

function emitChange() {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(CHANGE_EVENT))
}

function readToken(wallet?: string) {
  if (typeof window === 'undefined' || !wallet)
    return undefined
  try {
    return window.localStorage.getItem(tokenKey(wallet)) ?? undefined
  }
  catch {
    return undefined
  }
}

function writeToken(wallet: string, token?: string) {
  if (typeof window === 'undefined')
    return
  try {
    if (token)
      window.localStorage.setItem(tokenKey(wallet), token)
    else
      window.localStorage.removeItem(tokenKey(wallet))
  }
  catch {
    // keep sync best-effort when storage is blocked
  }
}

function readStoredStatus(wallet?: string): Omit<UserBlacklistSyncState, 'enabled'> {
  if (typeof window === 'undefined' || !wallet)
    return { busy: false }
  const volatileStatus = volatileStatusByWallet.get(wallet)
  try {
    const raw = window.localStorage.getItem(statusKey(wallet))
    if (!raw)
      return { busy: volatileStatus?.busy ?? false, error: volatileStatus?.error }
    const parsed = JSON.parse(raw) as Partial<UserBlacklistSyncState>
    return {
      busy: volatileStatus?.busy ?? false,
      lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : undefined,
      error: volatileStatus?.error,
    }
  }
  catch {
    return { busy: volatileStatus?.busy ?? false, error: volatileStatus?.error }
  }
}

function writeStatus(wallet: string, status: Omit<UserBlacklistSyncState, 'enabled'>) {
  volatileStatusByWallet.set(wallet, { busy: status.busy, error: status.error })
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(statusKey(wallet), JSON.stringify({ lastSyncAt: status.lastSyncAt }))
  }
  catch {
    // ignore storage errors; in-memory subscribers still refresh
  }
  emitChange()
}

function setBusy(wallet: string, busy: boolean) {
  writeStatus(wallet, { ...readStoredStatus(wallet), busy })
}

// On error, keep the last-known-good sync timestamp instead of blanking it —
// the user still wants to see when their blacklist was last in sync.
function setSyncResult(wallet: string, error?: string) {
  writeStatus(wallet, { busy: false, lastSyncAt: error ? readStoredStatus(wallet).lastSyncAt : Date.now(), error })
}

export function getUserBlacklistSyncState(wallet?: string | null): UserBlacklistSyncState {
  const normalized = normalizeWallet(wallet)
  const stored = readStoredStatus(normalized)
  const next: UserBlacklistSyncState = { ...stored, enabled: !!readToken(normalized) }
  const signature = JSON.stringify(next)
  if (normalized === lastSnapshotWallet && signature === lastSnapshotSignature)
    return lastSnapshot
  lastSnapshotWallet = normalized
  lastSnapshotSignature = signature
  lastSnapshot = next
  return next
}

export function subscribeUserBlacklistSync(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  window.addEventListener('storage', onEvent)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onEvent)
    window.removeEventListener('storage', onEvent)
  }
}

function emptyBlob(updatedAt = Date.now()): UserBlacklistBlob {
  return { v: 1, u: updatedAt, c: {}, o: {}, w: {} }
}

function localBlob(updatedAt = Date.now()): UserBlacklistBlob {
  const blob = emptyBlob(updatedAt)
  for (const entry of listLocalCollateralExclusionSyncRecords()) {
    const chainId = String(entry.chainId)
    blob.c[chainId] ??= {}
    blob.c[chainId][entry.collateralAddress.toLowerCase()] = {
      t: entry.ts,
      s: entry.symbol,
      n: entry.name,
      d: entry.deleted ? true : undefined,
    }
  }
  for (const entry of listLocalOracleExclusionSyncRecords()) {
    const chainId = String(entry.chainId)
    blob.o[chainId] ??= {}
    blob.o[chainId][entry.oracleAddress.toLowerCase()] = {
      t: entry.ts,
      p: entry.provider,
      cs: entry.collateralSymbol,
      d: entry.deleted ? true : undefined,
    }
  }
  for (const entry of listLocalMarketLostValueSyncRecords()) {
    const chainId = String(entry.chainId)
    blob.w[chainId] ??= {}
    blob.w[chainId][entry.marketUniqueKey.toLowerCase()] = {
      t: entry.ts,
      ls: entry.loanAssetSymbol,
      cs: entry.collateralAssetSymbol,
      la: entry.loanAssetAddress?.toLowerCase(),
      ca: entry.collateralAssetAddress?.toLowerCase(),
      d: entry.deleted ? true : undefined,
    }
  }
  return blob
}

// Last-writer-wins merge: when two devices diverge (e.g., exclusions added on each since last sync),
// pick the entry with the latest timestamp so the most recent action survives the merge.
export function mergeUserBlacklistBlobs(a: UserBlacklistBlob, b: UserBlacklistBlob): UserBlacklistBlob {
  const merged = emptyBlob(Date.now())

  for (const blob of [a, b]) {
    for (const [chainId, entries] of Object.entries(blob.c ?? {})) {
      merged.c[chainId] ??= {}
      for (const [address, entry] of Object.entries(entries)) {
        const existing = merged.c[chainId][address]
        if (!existing || entry.t >= existing.t)
          merged.c[chainId][address] = entry
      }
    }
    for (const [chainId, entries] of Object.entries(blob.o ?? {})) {
      merged.o[chainId] ??= {}
      for (const [address, entry] of Object.entries(entries)) {
        const existing = merged.o[chainId][address]
        if (!existing || entry.t >= existing.t)
          merged.o[chainId][address] = entry
      }
    }
    for (const [chainId, entries] of Object.entries(blob.w ?? {})) {
      merged.w[chainId] ??= {}
      for (const [marketId, entry] of Object.entries(entries)) {
        const existing = merged.w[chainId][marketId]
        if (!existing || entry.t >= existing.t)
          merged.w[chainId][marketId] = entry
      }
    }
  }

  return merged
}

function applyBlobToLocal(blob: UserBlacklistBlob) {
  isApplyingRemoteBlob = true
  try {
    for (const [chainId, entries] of Object.entries(blob.c ?? {})) {
      const parsedChainId = Number(chainId)
      if (!Number.isFinite(parsedChainId))
        continue
      for (const [address, entry] of Object.entries(entries)) {
        if (entry.d) {
          clearCollateralLocallyExcludedWithTimestamp(parsedChainId, address, entry.t)
          continue
        }
        setCollateralLocallyExcludedWithTimestamp(parsedChainId, address, {
          ts: entry.t,
          symbol: entry.s,
          name: entry.n,
        })
      }
    }
    for (const [chainId, entries] of Object.entries(blob.o ?? {})) {
      const parsedChainId = Number(chainId)
      if (!Number.isFinite(parsedChainId))
        continue
      for (const [address, entry] of Object.entries(entries)) {
        if (entry.d) {
          clearOracleLocallyExcludedWithTimestamp(parsedChainId, address, entry.t)
          continue
        }
        setOracleLocallyExcludedWithTimestamp(parsedChainId, address, {
          ts: entry.t,
          provider: entry.p,
          collateralSymbol: entry.cs,
        })
      }
    }
    for (const [chainId, entries] of Object.entries(blob.w ?? {})) {
      const parsedChainId = Number(chainId)
      if (!Number.isFinite(parsedChainId))
        continue
      for (const [marketId, entry] of Object.entries(entries)) {
        if (entry.d) {
          clearMarketLocallyMarkedLostValueWithTimestamp(parsedChainId, marketId, entry.t)
          continue
        }
        setMarketLocallyMarkedLostValueWithTimestamp(parsedChainId, marketId, {
          ts: entry.t,
          loanAssetSymbol: entry.ls,
          collateralAssetSymbol: entry.cs,
          loanAssetAddress: entry.la,
          collateralAssetAddress: entry.ca,
        })
      }
    }
  }
  finally {
    isApplyingRemoteBlob = false
  }
}

async function requestJson(path: string, init: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...init.headers,
    },
  })
  const data = await res.json().catch(() => null) as { error?: string } | null
  if (!res.ok)
    throw new Error(data?.error || `Sync request failed (${res.status})`)
  return data
}

async function fetchRemoteBlob(token: string) {
  const data = await requestJson(API_PATH, { headers: { authorization: `Bearer ${token}` } }) as { blob?: UserBlacklistBlob }
  return data.blob ?? emptyBlob()
}

async function putRemoteBlob(token: string, blob: UserBlacklistBlob) {
  const data = await requestJson(API_PATH, {
    method: 'PUT',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(blob),
  }) as { blob?: UserBlacklistBlob }
  return data.blob ?? blob
}

export function createUserBlacklistSyncMessage(wallet: string) {
  return [
    'MBM blacklist sync',
    '',
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued: ${new Date().toISOString()}`,
    '',
    'Sign once to enable local blacklist sync on this device.',
  ].join('\n')
}

export async function enableUserBlacklistSync(wallet: string, message: string, signature: string) {
  const normalized = normalizeWallet(wallet)
  if (!normalized)
    throw new Error('Connect a wallet before enabling sync')

  setBusy(normalized, true)
  try {
    const data = await requestJson(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: normalized, message, signature }),
    }) as { token?: string, blob?: UserBlacklistBlob }

    if (!data.token)
      throw new Error('Sync token was not returned')

    writeToken(normalized, data.token)
    const merged = mergeUserBlacklistBlobs(data.blob ?? emptyBlob(), localBlob())
    applyBlobToLocal(merged)
    await putRemoteBlob(data.token, merged)
    setSyncResult(normalized)
  }
  catch (error) {
    setSyncResult(normalized, error instanceof Error ? error.message : 'Sync failed')
    throw error
  }
}

export async function syncUserBlacklistNow(wallet: string) {
  const normalized = normalizeWallet(wallet)
  const token = readToken(normalized)
  if (!normalized || !token)
    throw new Error('Blacklist sync is not enabled for this wallet')

  setBusy(normalized, true)
  try {
    const merged = mergeUserBlacklistBlobs(await fetchRemoteBlob(token), localBlob())
    applyBlobToLocal(merged)
    await putRemoteBlob(token, merged)
    setSyncResult(normalized)
  }
  catch (error) {
    setSyncResult(normalized, error instanceof Error ? error.message : 'Sync failed')
    throw error
  }
}

export async function pushUserBlacklistSync(wallet: string) {
  const normalized = normalizeWallet(wallet)
  const token = readToken(normalized)
  if (!normalized || !token)
    return

  try {
    const merged = mergeUserBlacklistBlobs(await fetchRemoteBlob(token), localBlob())
    applyBlobToLocal(merged)
    await putRemoteBlob(token, merged)
    setSyncResult(normalized)
  }
  catch (error) {
    setSyncResult(normalized, error instanceof Error ? error.message : 'Sync failed')
  }
}

// Silent bidirectional sync on mount/tab-focus. Does NOT set busy state so the UI
// doesn't flicker. Errors are swallowed — this is best-effort background freshness.
export async function backgroundSyncUserBlacklist(wallet: string) {
  const normalized = normalizeWallet(wallet)
  const token = readToken(normalized)
  if (!normalized || !token)
    return
  if (Date.now() - lastBackgroundSyncAt < SYNC_COOLDOWN_MS)
    return

  lastBackgroundSyncAt = Date.now()
  try {
    const merged = mergeUserBlacklistBlobs(await fetchRemoteBlob(token), localBlob())
    applyBlobToLocal(merged)
    await putRemoteBlob(token, merged)
    setSyncResult(normalized)
  }
  catch {
    // Silently ignore background sync errors so focus events don't spam toasts.
  }
}

export function disableUserBlacklistSyncOnDevice(wallet: string) {
  const normalized = normalizeWallet(wallet)
  if (!normalized)
    return
  writeToken(normalized)
  writeStatus(normalized, { busy: false })
}

// Installs a single module-level listener (not per-component) that pushes local changes
// to the backend. Debounced at 1200ms to coalesce rapid edits (e.g., bulk-blacklisting)
// into one PUT instead of hammering the endpoint on every keystroke.
function ensureBackgroundListener() {
  if (typeof window === 'undefined' || unsubscribeLocal)
    return
  unsubscribeLocal = subscribeLocalMarketExclusions(() => {
    if (isApplyingRemoteBlob)
      return
    if (!activeWallet || !readToken(activeWallet))
      return
    if (debounceTimer)
      clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      if (activeWallet)
        void pushUserBlacklistSync(activeWallet)
    }, 1200)
  })
}

function useBlacklistSyncEffects(normalized: string | undefined) {
  useEffect(() => {
    activeWallet = normalized
    ensureBackgroundListener()

    if (!normalized)
      return
    const token = readToken(normalized)
    if (!token)
      return

    // Mount sync: wait a few seconds for the page to settle, then pull fresh data.
    const mountTimer = setTimeout(() => {
      void backgroundSyncUserBlacklist(normalized)
    }, 3000)

    // Focus sync: when the user returns to this tab after it was hidden for a while,
    // silently pull the latest remote blacklist so cross-device changes appear quickly.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible')
        return
      const wasHiddenFor = Date.now() - tabHiddenAt
      if (wasHiddenFor < MIN_HIDDEN_MS)
        return
      void backgroundSyncUserBlacklist(normalized)
    }
    const onVisibilityHidden = () => {
      if (document.visibilityState === 'hidden')
        tabHiddenAt = Date.now()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('visibilitychange', onVisibilityHidden)

    return () => {
      clearTimeout(mountTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('visibilitychange', onVisibilityHidden)
    }
  }, [normalized])
}

// Lightweight engine hook that installs the background push listener and
// mount/focus sync without returning UI state. Use this in a root-level
// component so local blacklist changes trigger XHRs even when the user
// has never opened Advanced Settings.
export function useUserBlacklistSyncEngine(wallet?: string | null) {
  const normalized = normalizeWallet(wallet)
  useBlacklistSyncEffects(normalized)
}

export function useUserBlacklistSync(wallet?: string | null) {
  const normalized = normalizeWallet(wallet)
  const serverState: UserBlacklistSyncState = { enabled: false, busy: false }
  useBlacklistSyncEffects(normalized)

  // gSSP form with a static server snapshot prevents hydration mismatches:
  // localStorage doesn't exist server-side, so the server render gets a known-inert default
  // while the client snapshot reads the real token/status from storage.
  return useSyncExternalStore(
    subscribeUserBlacklistSync,
    () => getUserBlacklistSyncState(normalized),
    () => serverState,
  )
}
