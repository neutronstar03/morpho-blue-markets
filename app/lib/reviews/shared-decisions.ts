// External manifest is validated once. Neither rank nor artifact presence grants approval.
export interface SharedCollateralDecision {
  chainId: number
  collateralAddress: string
  decision: 'whitelist' | 'blacklist'
  reason: string
  reviewPath: string
}

export const SHARED_DECISIONS_URL = 'https://raw.githubusercontent.com/neutronstar03/morpho-collateral-reviews/main/decisions.v1.json'

export function parseSharedDecisions(raw: unknown): SharedCollateralDecision[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid collateral decisions manifest')
  const payload = raw as Record<string, unknown>
  if (payload.version !== 1 || !Array.isArray(payload.decisions))
    throw new Error('Unsupported collateral decisions manifest')
  const entries = new Map<string, SharedCollateralDecision>()
  for (const value of payload.decisions) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid collateral decision')
    const item = value as Record<string, unknown>
    const { chainId, collateralAddress, decision, reason, reviewPath } = item
    if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0
      || typeof collateralAddress !== 'string' || !/^0x[a-f0-9]{40}$/.test(collateralAddress)
      || (decision !== 'whitelist' && decision !== 'blacklist')
      || typeof reason !== 'string' || !reason.trim()
      || reviewPath !== `v1/chain/${chainId}/${collateralAddress}.json`) {
      throw new Error('Invalid collateral decision identity, classification or evidence path')
    }
    const entry: SharedCollateralDecision = { chainId, collateralAddress, decision, reason, reviewPath }
    const key = `${chainId}:${collateralAddress}`
    const previous = entries.get(key)
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry))
      throw new Error(`Conflicting collateral decisions: ${key}`)
    entries.set(key, entry)
  }
  return [...entries.values()]
}

const listeners = new Set<() => void>()
let decisions = new Map<string, SharedCollateralDecision>()
let version = 0
export function getSharedDecision(chainId?: number, address?: string | null) {
  return decisions.get(`${chainId}:${address?.toLowerCase()}`)
}
export function replaceSharedDecisions(entries: SharedCollateralDecision[]) {
  decisions = new Map(entries.map(entry => [`${entry.chainId}:${entry.collateralAddress}`, entry]))
  version++
  listeners.forEach(listener => listener())
}
export function subscribeSharedDecisions(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getSharedDecisionsVersion() {
  return version
}
