import type { MarketRiskInput, MarketRiskReasonCode, MarketRiskStatusEntry } from './types'
import { isCollateralWhitelisted } from '../collateral-whitelist'
import { isCollateralLocallyExcluded, isMarketLocallyMarkedLostValue } from '../local-market-exclusions'
import { isMarketBlacklisted } from '../market-blacklist'
import { isOracleMisconfiguredWarning } from '../morpho/morpho-warnings'
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

  if (isMarketBlacklisted({
    chainId,
    uniqueKey,
    loanAssetAddress: input.loanAssetAddress,
    collateralAssetAddress: input.collateralAssetAddress,
    loanAssetSymbol: input.loanAssetSymbol,
    collateralAssetSymbol: input.collateralAssetSymbol,
  })) {
    return {
      status: 'black',
      reasonCodes: ['blacklist'],
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

  const reasons: MarketRiskReasonCode[] = ['unknown_collateral']
  return {
    status: 'yellow',
    reasonCodes: reasons,
  }
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
