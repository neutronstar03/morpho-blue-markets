import { gql } from 'graphql-request'

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
        marketId
        uniqueKey: marketId
        lltv
        oracle { address }
        irmAddress
        morphoBlue {
          chain { id }
        }

        loanAsset { address symbol name decimals }
        collateralAsset { address symbol name decimals }
        supplyingVaults { address }
        supplyingVaultV2s { address }

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
        listed
        creationTimestamp
        warnings { type level }
      }
    }
  }
`
