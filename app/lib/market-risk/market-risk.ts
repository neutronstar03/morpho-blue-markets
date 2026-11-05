// Derives a market's risk status from local exclusions, system health, collateral decisions, and the static blacklist.
import type { MarketRiskInput, MarketRiskReasonCode, MarketRiskStatus, MarketRiskStatusEntry } from './types'
import { isCollateralWhitelisted } from '../collateral-whitelist'
import { isCollateralLocallyExcluded, isMarketLocallyMarkedLostValue, isOracleLocallyExcluded } from '../local-market-exclusions'
import { getAssetBlacklistReason, isMarketBlacklisted } from '../market-blacklist'
import { isOracleMisconfiguredWarning } from '../morpho/morpho-warnings'
import { getSharedDecision } from '../reviews/shared-decisions'
import { isMarketSystemUnhealthy } from '../unhealthy-markets'
import { getCollateralDecision } from './collateral-decisions'

export function getMarketRisk(input: MarketRiskInput): MarketRiskStatusEntry {
  const chainId = input.chainId
  const uniqueKey = input.uniqueKey
  const collateralAddress = input.collateralAssetAddress

  if (!chainId || !uniqueKey) {
    return {
      status: 'yellow',
      reasonCodes: ['missing_market_data'],
    }
  }

  if (isCollateralLocallyExcluded(chainId, collateralAddress)) {
    return {
      status: 'black',
      reasonCodes: ['local_blacklist'],
    }
  }

  if (isMarketLocallyMarkedLostValue(chainId, uniqueKey)) {
    return {
      status: 'black',
      reasonCodes: ['local_market_lost_value'],
    }
  }

  if (isOracleLocallyExcluded(chainId, input.oracleAddress)) {
    return {
      status: 'black',
      reasonCodes: ['local_oracle_blacklist'],
    }
  }

  if (isMarketSystemUnhealthy(uniqueKey, chainId)) {
    return {
      status: 'black',
      reasonCodes: ['system_unhealthy_borrowers'],
    }
  }

  const shared = getSharedDecision(chainId, collateralAddress)
  if (shared?.decision === 'blacklist') {
    return { status: 'black', reasonCodes: ['shared_blacklist'], reason: shared.reason }
  }

  if (isMarketBlacklisted({
    chainId,
    uniqueKey,
    loanAssetAddress: input.loanAssetAddress,
    collateralAssetAddress: input.collateralAssetAddress,
    loanAssetSymbol: input.loanAssetSymbol,
    collateralAssetSymbol: input.collateralAssetSymbol,
    oracleAddress: input.oracleAddress,
  })) {
    return {
      status: 'black',
      reasonCodes: ['blacklist'],
      reason: getAssetBlacklistReason(collateralAddress, chainId) ?? getAssetBlacklistReason(input.loanAssetAddress, chainId),
    }
  }

  if (isOracleMisconfiguredWarning(input.warnings)) {
    return {
      status: 'black',
      reasonCodes: ['oracle_misconfigured'],
    }
  }

  const decision = getCollateralDecision(chainId, collateralAddress)
  if (decision?.decision === 'ban') {
    return {
      status: 'black',
      reasonCodes: ['manual_ban'],
    }
  }
  if (decision?.decision === 'approve') {
    return {
      status: 'white',
      reasonCodes: ['manual_approve'],
    }
  }

  if (isCollateralWhitelisted(chainId, collateralAddress)) {
    return {
      status: 'white',
      reasonCodes: ['ok'],
    }
  }

  if (shared?.decision === 'whitelist') {
    return {
      status: 'white',
      reasonCodes: ['collateral_review'],
      reason: shared.reason,
    }
  }

  const reasons: MarketRiskReasonCode[] = ['unknown_collateral']
  return {
    status: 'yellow',
    reasonCodes: reasons,
  }
}

export interface MarketRiskStatusInput {
  chainId?: number
  uniqueKey?: string
  loanAsset?: { address?: string | null, symbol?: string | null }
  collateralAsset?: { address?: string | null, symbol?: string | null }
  oracleAddress?: string | null
  hasCollateralReview?: boolean
  warnings?: Array<{ type: string, level?: 'YELLOW' | 'RED' | string }>
}

// Accepts nested asset objects (e.g. market.loanAsset) so callers don't have to manually flatten fields into MarketRiskInput every time.
export function getMarketRiskStatus(input: MarketRiskStatusInput): MarketRiskStatus {
  return getMarketRisk({
    chainId: input.chainId,
    uniqueKey: input.uniqueKey,
    loanAssetAddress: input.loanAsset?.address,
    collateralAssetAddress: input.collateralAsset?.address,
    loanAssetSymbol: input.loanAsset?.symbol,
    collateralAssetSymbol: input.collateralAsset?.symbol,
    oracleAddress: input.oracleAddress,
    hasCollateralReview: input.hasCollateralReview,
    warnings: input.warnings,
  }).status
}

export function getExecutionGuard(markets: MarketRiskInput[]) {
  for (const m of markets) {
    const risk = getMarketRisk(m)
    if (risk.status === 'yellow') {
      return {
        canExecute: false as const,
        blockingReason: 'Check collateral' as const,
      }
    }
  }
  return { canExecute: true as const }
}
