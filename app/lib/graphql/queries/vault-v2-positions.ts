import { gql } from 'graphql-request'

export const QUERY_USER_VAULT_V2_POSITIONS = gql`
  query GetUserVaultV2Positions($user: String!, $chainId: Int!) {
    userByAddress(address: $user, chainId: $chainId) {
      vaultV2Positions {
        shares
        assets
        assetsUsd
        vault {
          address
          name
          symbol
          netApy
          asset {
            address
            symbol
            decimals
            price {
              usd
            }
          }
        }
      }
    }
  }
`

export const QUERY_USER_VAULT_V2_CHAINS = gql`
  query GetUserVaultV2Chains($user: String!, $chainId: Int!) {
    userByAddress(address: $user, chainId: $chainId) {
      vaultV2Positions {
        shares
        assets
        vault {
          address
        }
      }
    }
  }
`
