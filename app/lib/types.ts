export interface MarketAsset {
  address: string
  symbol: string
  decimals: number
  name: string
}

export interface FrontendMarket {
  id?: string
  uniqueKey: string
  chainId: number
  lltv: string
  oracleAddress: string
  irmAddress: string
  creationBlockNumber?: number
  creationTimestamp: number
  creatorAddress?: string
  loanAsset: MarketAsset
  collateralAsset?: MarketAsset | null
  metrics: CuratedMarketMetrics
  whitelisted: boolean
  oracle?: {
    address: string
    [key: string]: any
  } | null
  morphoBlue?: {
    address: string
    [key: string]: any
  } | null
  isStablecoinPair?: boolean
  tvl?: number
}

export interface CuratedMarketToken {
  address: string
  symbol: string
  name: string
  decimals: number
}

export interface CuratedMarketMetrics {
  tvl: number
  totalSupply: string
  totalBorrow: string
  supplyApy: number
  borrowApy: number
  utilization: number
  isStablecoinPair: boolean
  supplyApyFormatted: string
  borrowApyFormatted: string
  utilizationFormatted: string
  lltvFormatted: string
  tvlFormatted: string
}

export interface CuratedMarket {
  id: string
  chainId: number
  lltv: string
  oracleAddress: string
  irmAddress: string
  loanToken: CuratedMarketToken
  collateralToken: CuratedMarketToken
  metrics: CuratedMarketMetrics
  whitelisted: boolean
  createdAt: number
}

// --- Output JSON TypeScript Interface ---
export interface CuratedMarketJSON {
  generatedAt: string
  totalMarkets: number
  curatedCount: number
  criteria: {
    chains: string[]
    minTvlUsd: number
    minSupplyApy: number
    sortBy: string
    note: string
  }
  fieldInfo: {
    note: string
    supplyApy: string
    borrowApy: string
    utilization: string
    tvl: string
    totalSupply: string
    totalBorrow: string
  }
  markets: CuratedMarket[]
}

export interface FormattedMarket {
  id: string
  name: string
  pair: string
  chainId: number
  chainName: string
  loanAsset: MarketAsset
  collateralAsset: MarketAsset
  totalSupplyFormatted: string
  totalBorrowFormatted: string
  supplyApyFormatted: string
  borrowApyFormatted: string
  utilizationFormatted: string
  tvlFormatted: string
  lltvPercent: string
  lltvRaw: string
  oracleAddress: string
  irmAddress: string
  whitelisted: boolean
  createdAt: string
  creationTimestamp: number
}
