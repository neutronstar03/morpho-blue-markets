import { gql } from 'graphql-request'

export const QUERY_COLLATERAL_SUPPLY_AGGREGATE = gql`
  query GetCollateralSupplyAggregate(
    $first: Int!
    $skip: Int!
    $where: MarketFilters
  ) {
    markets(first: $first, skip: $skip, where: $where) {
      items {
        state {
          supplyAssetsUsd
        }
      }
    }
  }
`
