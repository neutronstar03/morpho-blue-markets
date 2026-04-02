export interface LoanAssetOption {
  address: string
  symbol: string
  decimals: number
  priceUsd?: number | null
}

export interface AutoStepInfo {
  stepAssets: bigint
  stepRatioWad: bigint
  attempts: number
  fromCache: boolean
}

export interface OptimizerMarketMeta {
  collateralSymbol?: string
  status?: 'white' | 'blue' | 'yellow' | 'purple' | 'black'
}
