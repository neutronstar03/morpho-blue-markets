import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { filterBlacklistedMarkets } from '~/lib/market-blacklist'
import { graphqlClient } from '../../graphql/client'

export interface MorphoMarket {
  uniqueKey: string
  lltv: string
  oracleAddress: string
  irmAddress: string
  morphoBlue: {
    chain: {
      id: number
    }
  }
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
    borrowApy: number
    utilization: number
    supplyAssetsUsd?: number
    borrowAssetsUsd?: number

    dailyPriceVariation: number

    netSupplyApy: number
    avgNetSupplyApy: number
    dailyNetSupplyApy: number
    weeklyNetSupplyApy: number

    netBorrowApy: number
    avgNetBorrowApy: number
    dailyNetBorrowApy: number
    weeklyNetBorrowApy: number
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

export const QUERY_LIST_MARKETS = gql`
  query GetListMarkets(
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
        uniqueKey
        lltv
        oracleAddress
        irmAddress
        morphoBlue {
          chain { id }
        }

        loanAsset { address symbol name decimals }
        collateralAsset { address symbol name decimals }
        supplyingVaults { address }

        state {
          supplyAssets
          borrowAssets
          supplyAssetsUsd
          borrowAssetsUsd
          utilization
          # this value is awesome, it's the variation of the collateral price over the last 24 hours
          dailyPriceVariation

          netSupplyApy
          avgNetSupplyApy
          dailyNetSupplyApy
          weeklyNetSupplyApy

          netBorrowApy
          avgNetBorrowApy
          dailyNetBorrowApy
          weeklyNetBorrowApy
        }
        whitelisted
        creationTimestamp
      }
    }
  }
`

export enum MarketOrderBy {
  UniqueKey = 'UniqueKey',
  Lltv = 'Lltv',
  BorrowAssets = 'BorrowAssets',
  BorrowAssetsUsd = 'BorrowAssetsUsd',
  SupplyAssets = 'SupplyAssets',
  SupplyAssetsUsd = 'SupplyAssetsUsd',
  BorrowShares = 'BorrowShares',
  SupplyShares = 'SupplyShares',
  Utilization = 'Utilization',
  RateAtUTarget = 'RateAtUTarget',
  ApyAtTarget = 'ApyAtTarget',
  SupplyApy = 'SupplyApy',
  NetSupplyApy = 'NetSupplyApy',
  BorrowApy = 'BorrowApy',
  NetBorrowApy = 'NetBorrowApy',
  Fee = 'Fee',
  LoanAssetSymbol = 'LoanAssetSymbol',
  CollateralAssetSymbol = 'CollateralAssetSymbol',
  TotalLiquidityUsd = 'TotalLiquidityUsd',
  AvgBorrowApy = 'AvgBorrowApy',
  AvgNetBorrowApy = 'AvgNetBorrowApy',
  DailyBorrowApy = 'DailyBorrowApy',
  DailyNetBorrowApy = 'DailyNetBorrowApy',
  CredoraRiskScore = 'CredoraRiskScore',
  SizeUsd = 'SizeUsd',
}

export enum OrderDirection {
  Asc = 'Asc',
  Desc = 'Desc',
}

export interface MarketFilters {
  supplyApy_gte?: number
  supplyApy_lte?: number
  supplyAssetsUsd_gte?: number
  borrowApy_gte?: number
  borrowApy_lte?: number
  chainId_in?: number[]
  collateralAssetAddress_in?: string[]
  loanAssetAddress_in?: string[]
}

interface UseMarketsProps {
  where: MarketFilters
  orderBy: MarketOrderBy
  orderDirection: OrderDirection
  first?: number
  skip?: number
  staleTime?: number
}

export function useMarkets({
  where,
  orderBy,
  orderDirection,
  first = 100,
  skip = 0,
  staleTime = 1 * 60 * 1000, // 1 minute
}: UseMarketsProps) {
  return useQuery<QueryMarketsResult>({
    queryKey: ['markets', where, orderBy, orderDirection, first, skip],
    queryFn: async () => {
      const result = await graphqlClient.request<QueryMarketsResult>(QUERY_LIST_MARKETS, {
        where,
        orderBy,
        orderDirection,
        first,
        skip,
      })
      const markets = result.markets.items || []
      return {
        ...result,
        markets: {
          items: filterBlacklistedMarkets(markets, market => ({
            uniqueKey: market.uniqueKey,
            loanAssetAddress: market.loanAsset?.address,
            collateralAssetAddress: market.collateralAsset?.address,
            loanAssetSymbol: market.loanAsset?.symbol,
            collateralAssetSymbol: market.collateralAsset?.symbol,
            chainId: market.morphoBlue?.chain?.id,
          })),
        },
      }
    },
    staleTime,
  })
}
