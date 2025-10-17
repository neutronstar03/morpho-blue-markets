export interface MorphoMarket {
  uniqueKey: string
  lltv: string
  oracleAddress: string
  irmAddress: string
  loanAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  collateralAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  state: {
    supplyAssets: string
    borrowAssets: string
    supplyApy: number
    borrowApy: number
    utilization: number
    supplyAssetsUsd?: number | null
    borrowAssetsUsd?: number | null
  }
  whitelisted: boolean
  creationTimestamp: string
}

export interface QueryMarketsResult {
  chain?: { id: string }
  markets: {
    items: MorphoMarket[]
  }
}
