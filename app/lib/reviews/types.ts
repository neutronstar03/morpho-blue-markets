export interface ReviewSource {
  label: string
  url: string
}

export interface CollateralReview {
  version: number
  chainId: number
  collateralAddress: string
  symbol: string | null
  name: string | null
  type: string | null
  protocol: string | null
  protocolUrl: string | null
  rank: number | null
  redeem: string | null
  notes: string | null
  sources: ReviewSource[]
}

export interface OracleReview {
  version: '1.1'
  chainId: number
  oracleAddress: string
  type: string
  provider: string
  rank: number
  pricing: string
  notes: string
  sources: ReviewSource[]
}

export interface MarketReviewBundle {
  collateralReview: CollateralReview | null
  oracleReview: OracleReview | null
}

export type ReviewedCollateralListItem = [chainId: number, collateralAddress: string]

export type CollateralReviewApiResponse = {
  found: true
  profile: CollateralReview
  collateralReview: CollateralReview
  oracleReview: OracleReview | null
} | {
  found: false
  profile: null
  collateralReview: null
  oracleReview: OracleReview | null
}
