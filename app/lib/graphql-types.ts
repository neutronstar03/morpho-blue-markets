export interface Market {
  id: string
  uniqueKey: string
  lltv: string
  oracle: {
    address: string
  }
  irmAddress: string
  creationTimestamp: string
  whitelisted: boolean
  loanAsset: {
    address: string
    symbol: string
    name: string | null
    decimals: number | null
    chain: {
      id: string
    }
  }
  collateralAsset: {
    address: string
    symbol: string
    name: string | null
    decimals: number | null
    chain: {
      id: string
    }
  }
  state: {
    supplyApy: number
    borrowApy: number
    supplyAssets: string
    borrowAssets: string
    utilization: number
    price: string
  }
}

export interface MarketPosition {
  id: string
  user: {
    id: string
  }
  market: {
    uniqueKey: string
    morphoBlue: {
      chain: {
        id: number
      }
    }
    loanAsset: {
      symbol: string
      address: string
      decimals: number
    }
    collateralAsset: {
      symbol: string
      address: string
      decimals: number
    }
    badDebt: { usd: number }
    realizedBadDebt: { usd: number }
    state: {
      avgSupplyApy: number
      netSupplyApy: number
      supplyAssets: string
      supplyShares: string
    }
  }
  state: {
    supplyShares: string
    borrowShares: string
    collateral: string
  }
}

export interface QueryMarketPositionsResult {
  marketPositions: {
    items: MarketPosition[]
  }
}
