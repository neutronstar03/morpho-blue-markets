import { gql } from 'graphql-request'

// Keep this query in a shared, non-React module so both the app and
// local scripts can use the exact same GraphQL selection set.

// A specific, isolated type containing only the fields required for the
// supply-side optimizer flows.
export interface SupplyMarketData {
  marketId: string
  uniqueKey: string
  irmAddress: string
  oracleAddress?: string | null
  loanAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
    chain?: {
      id: number
      network?: string | null
    }
  }
  collateralAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  state: {
    netSupplyApy: number
    supplyApy: number
    supplyAssets: string
    supplyShares: string
    supplyAssetsUsd?: number
    rewards?: Array<{
      supplyApr?: number | null
      id: string
      asset: {
        address: string
        symbol: string
        decimals?: number | null
      }
    }> | null
  }
  warnings?: Array<{
    type: string
    level: 'YELLOW' | 'RED'
  }>
}

export enum MarketOrderBy {
  NetSupplyApy = 'NetSupplyApy',
}

export enum OrderDirection {
  Desc = 'Desc',
}

export interface QueryMarketsByChainResult {
  markets: {
    items: SupplyMarketData[]
  }
}

export const QUERY_MARKETS_BY_CHAIN = gql`
  query GetMarketsByChain(
    $first: Int!
    $skip: Int!
    $where: MarketFilters
    $orderBy: MarketOrderBy
    $orderDirection: OrderDirection
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      items {
        marketId
        uniqueKey: marketId
        irmAddress
        oracleAddress
        loanAsset {
          address
          symbol
          name
          decimals
          chain { id network }
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          netSupplyApy
          supplyApy
          supplyAssets
          supplyShares
          supplyAssetsUsd
          rewards {
            id
            supplyApr
            asset { address symbol decimals }
          }
        }
        warnings { type level }
      }
    }
  }
`
