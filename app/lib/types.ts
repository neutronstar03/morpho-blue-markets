export interface MarketAsset {
  address: string
  symbol: string
  decimals?: number | null
  name?: string | null
}

export interface MarketState {
  supplyAssets: string
  borrowAssets: string
  supplyApy: number
  borrowApy: number
  utilization: number
  supplyAssetsUsd?: number | null
  borrowAssetsUsd?: number | null
}

export interface Market {
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
  state: MarketState
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

export interface MarketResponse {
  markets: {
    items: Market[]
  }
}

export interface CuratedMarketToken {
  address: string
  symbol: string
  name: string
  decimals: number
}

export interface CuratedMarketMetrics {
  tvl: number
  totalSupply: number
  totalBorrow: number
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
