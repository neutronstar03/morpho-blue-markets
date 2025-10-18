import type { QueryMarketPositionsResult } from '../graphql-types'
import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '../graphql/client'

const userMarketPositionsQuery = gql`
  query GetUserMarketPositions($userAddress: String!) {
    marketPositions(
      where: { userAddress_in: [$userAddress], supplyShares_gte: "1" }
    ) {
      items {
        id
        user {
          id
        }
        market {
          uniqueKey
          loanAsset {
            symbol
            address
            decimals
          }
          collateralAsset {
            symbol
            address
            decimals
          }
          morphoBlue {
            chain {
              id
            }
          }
        }
        state {
          supplyShares
          borrowShares
          collateral
        }
        market {
          badDebt {
            usd
          }
          realizedBadDebt {
            usd
          }
          state {
            avgSupplyApy
            netSupplyApy
            supplyAssets
            supplyShares
          }
        }
      }
    }
  }
`

export function useMarketPositions(userAddress?: string) {
  return useQuery<QueryMarketPositionsResult>({
    queryKey: ['market-positions', userAddress],
    queryFn: async () => {
      if (!userAddress) {
        throw new Error('User address is not available')
      }
      return graphqlClient.request(userMarketPositionsQuery, {
        userAddress: userAddress.toLowerCase(),
      })
    },
    enabled: !!userAddress,
    staleTime: 1 * 60 * 1000, // 1 minute
  })
}
