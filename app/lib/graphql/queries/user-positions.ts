import { gql } from 'graphql-request'

// Query to get user's positions on a specific chain
// This is the efficient discovery query - only fetches markets where user has a position
export const QUERY_USER_POSITIONS = gql`
  query GetUserPositions($user: String!, $chainId: Int!, $first: Int!, $skip: Int!) {
    marketPositions(
      where: { userAddress_in: [$user], chainId_in: [$chainId], supplyShares_gte: "1" }
      first: $first
      skip: $skip
      orderBy: SupplyShares
      orderDirection: Desc
    ) {
      pageInfo { countTotal count limit skip }
      items {
        market {
          marketId
          uniqueKey: marketId
          loanAsset {
            symbol
            decimals
            address
            price {
              usd
            }
          }
          collateralAsset {
            symbol
            decimals
            address
          }
          oracle {
            address
          }
          irmAddress
          lltv
          warnings { type level }
          state {
            netSupplyApy
            utilization
            supplyAssets
            supplyShares
            supplyAssetsUsd
            rewards {
              id
              supplyApr
              asset { address symbol decimals }
            }
          }
        }
        state {
          supplyShares
          borrowShares
          collateral
        }
      }
    }
  }
`

export const QUERY_USER_POSITIONS_ALL_CHAINS = gql`
  query GetUserPositionsAllChains($user: String!, $chainIds: [Int!], $first: Int!, $skip: Int!) {
    marketPositions(
      where: { userAddress_in: [$user], chainId_in: $chainIds, supplyShares_gte: "1" }
      first: $first
      skip: $skip
      orderBy: SupplyShares
      orderDirection: Desc
    ) {
      pageInfo { countTotal count limit skip }
      items {
        market {
          marketId
          uniqueKey: marketId
          state {
            supplyAssets
            supplyShares
          }
          warnings { type level }
          morphoBlue {
            chain {
              id
            }
          }
        }
        state {
          supplyShares
        }
      }
    }
  }
`
