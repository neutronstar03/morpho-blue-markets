// Keep the full palette even if some statuses are unused for now.
export type MarketRiskStatus = 'white' | 'blue' | 'yellow' | 'purple' | 'black'

export type MarketRiskReasonCode
  = | 'ok'
    | 'unknown_collateral'
    | 'local_blacklist'
    | 'local_market_lost_value'
    | 'manual_approve'
    | 'manual_ban'
    | 'blacklist'
    | 'system_unhealthy_borrowers'
    | 'oracle_misconfigured'
    | 'missing_market_data'

export interface MarketRiskStatusEntry {
  status: MarketRiskStatus
  reasonCodes: MarketRiskReasonCode[]
}

export interface ExecutionGuard {
  canExecute: boolean
  blockingReason?: 'Check collateral'
}

export interface MarketRiskInput {
  chainId?: number
  uniqueKey?: string
  loanAssetAddress?: string | null
  collateralAssetAddress?: string | null
  loanAssetSymbol?: string | null
  collateralAssetSymbol?: string | null
  warnings?: Array<{ type: string, level?: 'YELLOW' | 'RED' | string }>
}
