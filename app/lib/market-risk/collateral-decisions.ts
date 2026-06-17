import type { MarketRiskStatusEntry } from './types'

export type CollateralDecision = 'approve' | 'ban'

export interface CollateralDecisionEntry {
  decision: CollateralDecision
  ts: number
  symbol?: string
  name?: string
}

export interface CollateralDecisionRecord extends CollateralDecisionEntry {
  chainId: number
  collateralAddress: string
}

export interface CollateralDecisionSyncRecord {
  chainId: number
  collateralAddress: string
  ts: number
  decision?: CollateralDecision
  symbol?: string
  name?: string
  deleted?: boolean
}

interface StoredCollateralDecisionEntry {
  decision?: CollateralDecision
  ts: number
  symbol?: string
  name?: string
  deleted?: boolean
}

const KEY_PREFIX = 'collateral-decision:v1:'
const CHANGE_EVENT = 'collateral-decisions:changed'

let decisionsVersion = 0

function normalizeAddress(address?: string | null) {
  return (address ?? '').trim().toLowerCase()
}

function makeKey(chainId: number, collateralAddress: string) {
  return `${KEY_PREFIX}${chainId}:${normalizeAddress(collateralAddress)}`
}

function parseKey(key: string): { chainId: number, collateralAddress: string } | undefined {
  if (!key.startsWith(KEY_PREFIX))
    return undefined
  const suffix = key.slice(KEY_PREFIX.length)
  const sep = suffix.indexOf(':')
  if (sep < 0)
    return undefined
  const chainId = Number.parseInt(suffix.slice(0, sep), 10)
  const collateralAddress = normalizeAddress(suffix.slice(sep + 1))
  if (!Number.isFinite(chainId) || chainId <= 0 || !collateralAddress)
    return undefined
  return { chainId, collateralAddress }
}

function readStoredEntry(key: string): StoredCollateralDecisionEntry | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as Partial<StoredCollateralDecisionEntry>
    if (!parsed)
      return undefined
    if (parsed.deleted === true) {
      return {
        ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
        deleted: true,
      }
    }
    if (parsed.decision !== 'approve' && parsed.decision !== 'ban')
      return undefined
    return {
      decision: parsed.decision,
      ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
      symbol: typeof parsed.symbol === 'string' && parsed.symbol.trim() ? parsed.symbol.trim() : undefined,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined,
    }
  }
  catch {
    return undefined
  }
}

function safeRead(key: string): CollateralDecisionEntry | undefined {
  const entry = readStoredEntry(key)
  if (!entry || entry.deleted || !entry.decision)
    return undefined
  return {
    decision: entry.decision,
    ts: entry.ts,
    symbol: entry.symbol,
    name: entry.name,
  }
}

function safeWrite(key: string, value: StoredCollateralDecisionEntry | undefined) {
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

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : Date.now()
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  decisionsVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getCollateralDecisionsVersion() {
  return decisionsVersion
}

export function getCollateralDecision(chainId?: number, collateralAddress?: string | null) {
  if (chainId == null || !collateralAddress)
    return undefined
  return safeRead(makeKey(chainId, collateralAddress))
}

export function setCollateralDecision(
  chainId: number,
  collateralAddress: string,
  decision: CollateralDecision,
  metadata?: { symbol?: string | null, name?: string | null },
) {
  setCollateralDecisionWithTimestamp(chainId, collateralAddress, decision, {
    ts: Date.now(),
    symbol: metadata?.symbol,
    name: metadata?.name,
  })
}

export function setCollateralDecisionWithTimestamp(
  chainId: number,
  collateralAddress: string,
  decision: CollateralDecision,
  metadata?: { ts?: number, symbol?: string | null, name?: string | null },
) {
  const key = makeKey(chainId, collateralAddress)
  safeWrite(key, {
    decision,
    ts: normalizeTimestamp(metadata?.ts),
    symbol: typeof metadata?.symbol === 'string' && metadata.symbol.trim() ? metadata.symbol.trim() : undefined,
    name: typeof metadata?.name === 'string' && metadata.name.trim() ? metadata.name.trim() : undefined,
  })
  emitChange()
}

export function clearCollateralDecision(chainId: number, collateralAddress: string) {
  clearCollateralDecisionWithTimestamp(chainId, collateralAddress)
}

export function clearCollateralDecisionWithTimestamp(chainId: number, collateralAddress: string, ts?: number) {
  const key = makeKey(chainId, collateralAddress)
  safeWrite(key, {
    ts: normalizeTimestamp(ts),
    deleted: true,
  })
  emitChange()
}

export function subscribeCollateralDecisions(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  const onEvent = () => listener()
  const onStorage = (e: StorageEvent) => {
    if (!e.key)
      return
    if (e.key.startsWith(KEY_PREFIX)) {
      decisionsVersion++
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

export function listCollateralDecisions(): CollateralDecisionRecord[] {
  if (typeof window === 'undefined')
    return []

  const out: CollateralDecisionRecord[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key)
        continue
      const parsedKey = parseKey(key)
      if (!parsedKey)
        continue
      const entry = safeRead(key)
      if (!entry)
        continue
      out.push({
        chainId: parsedKey.chainId,
        collateralAddress: parsedKey.collateralAddress,
        decision: entry.decision,
        ts: entry.ts,
        symbol: entry.symbol,
        name: entry.name,
      })
    }
  }
  catch {
    return []
  }

  return out.sort((a, b) => b.ts - a.ts)
}

export function listCollateralDecisionSyncRecords(): CollateralDecisionSyncRecord[] {
  if (typeof window === 'undefined')
    return []

  const out: CollateralDecisionSyncRecord[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key)
        continue
      const parsedKey = parseKey(key)
      if (!parsedKey)
        continue
      const entry = readStoredEntry(key)
      if (!entry)
        continue
      out.push({
        chainId: parsedKey.chainId,
        collateralAddress: parsedKey.collateralAddress,
        ts: entry.ts,
        decision: entry.decision,
        symbol: entry.symbol,
        name: entry.name,
        deleted: entry.deleted,
      })
    }
  }
  catch {
    return []
  }

  return out.sort((a, b) => b.ts - a.ts)
}

// Convenience helper for places that want to show the outcome.
export function decisionToStatus(decision: CollateralDecision | undefined): MarketRiskStatusEntry['status'] | undefined {
  if (decision === 'approve')
    return 'white'
  if (decision === 'ban')
    return 'black'
  return undefined
}
