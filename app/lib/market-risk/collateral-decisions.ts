import type { MarketRiskStatusEntry } from './types'

export type CollateralDecision = 'approve' | 'ban'

export interface CollateralDecisionEntry {
  decision: CollateralDecision
  ts: number
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

function safeRead(key: string): CollateralDecisionEntry | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as Partial<CollateralDecisionEntry>
    if (!parsed || (parsed.decision !== 'approve' && parsed.decision !== 'ban'))
      return undefined
    return {
      decision: parsed.decision,
      ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
    }
  }
  catch {
    return undefined
  }
}

function safeWrite(key: string, value: CollateralDecisionEntry | undefined) {
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

export function setCollateralDecision(chainId: number, collateralAddress: string, decision: CollateralDecision) {
  const key = makeKey(chainId, collateralAddress)
  safeWrite(key, { decision, ts: Date.now() })
  emitChange()
}

export function clearCollateralDecision(chainId: number, collateralAddress: string) {
  const key = makeKey(chainId, collateralAddress)
  safeWrite(key, undefined)
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

// Convenience helper for places that want to show the outcome.
export function decisionToStatus(decision: CollateralDecision | undefined): MarketRiskStatusEntry['status'] | undefined {
  if (decision === 'approve')
    return 'white'
  if (decision === 'ban')
    return 'black'
  return undefined
}
