import { gql } from 'graphql-request'

export const GetMarketDocument = gql`
  query GetMarket($uniqueKey: String!, $chainId: Int!) {
    marketByUniqueKey(uniqueKey: $uniqueKey, chainId: $chainId) {
      id
      uniqueKey
      lltv
      oracle {
        address
      }
      irmAddress
      creationTimestamp
      whitelisted
      loanAsset {
        address
        symbol
        name
        decimals
        chain {
          id
        }
      }
      collateralAsset {
        address
        symbol
        name
        decimals
        chain {
          id
        }
      }
      state {
        supplyApy
        borrowApy
        supplyAssets
        borrowAssets
        utilization
        price
      }
    }
  }
`
