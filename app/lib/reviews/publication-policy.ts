import type { SharedCollateralDecision } from './shared-decisions'

export interface PublishedCollateral {
  chainId: number
  collateralAddress: string
}
export type AssetExclusions = Record<string, Array<{ assetContract: string, comment: string }>>

const keyOf = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`

export function createCollateralPublicationPolicy(decisions: SharedCollateralDecision[], exclusions: AssetExclusions) {
  const excluded = new Set<string>()
  for (const [chain, entries] of Object.entries(exclusions)) {
    const chainId = Number(chain)
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !Array.isArray(entries))
      throw new Error('Invalid durable asset exclusion chain')
    for (const entry of entries) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(entry.assetContract) || !entry.comment?.trim())
        throw new Error('Invalid durable asset exclusion identity/reason')
      excluded.add(keyOf(chainId, entry.assetContract))
    }
  }
  for (const entry of decisions) {
    if (entry.decision === 'blacklist')
      excluded.add(keyOf(entry.chainId, entry.collateralAddress))
  }
  const positive = decisions.filter(entry => entry.decision === 'whitelist')
  return {
    isExcluded: (chainId: number, address?: string | null) => !!address && excluded.has(keyOf(chainId, address)),
    conflicts: positive.filter(entry => excluded.has(keyOf(entry.chainId, entry.collateralAddress))),
    applyWhitelist: (legacy: unknown): PublishedCollateral[] => {
      if (!Array.isArray(legacy))
        throw new Error('Invalid previously published collateral whitelist')
      const result = new Map<string, PublishedCollateral>()
      // Preserve existing published approvals, but never promote a newly discovered ticker/price.
      for (const raw of legacy) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw new Error('Invalid published whitelist entry')
        const entry = raw as Record<string, unknown>
        const { chainId, collateralAddress } = entry
        if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0
          || typeof collateralAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(collateralAddress)) {
          throw new Error('Invalid published collateral identity')
        }
        const normalized = { chainId, collateralAddress: collateralAddress.toLowerCase() }
        result.set(keyOf(chainId, collateralAddress), normalized)
      }
      for (const entry of positive)
        result.set(keyOf(entry.chainId, entry.collateralAddress), { chainId: entry.chainId, collateralAddress: entry.collateralAddress })
      for (const key of excluded)
        result.delete(key)
      return [...result.values()].sort((a, b) => a.chainId - b.chainId || a.collateralAddress.localeCompare(b.collateralAddress))
    },
  }
}
