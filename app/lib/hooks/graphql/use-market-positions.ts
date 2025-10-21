import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '../../graphql/client'

// @deprecated: use useLiveMarketPositions instead

export interface MarketPosition {
  id: string
  user: {
    id: string
  }
  market: {
    uniqueKey: string
    morphoBlue: {
      chain: {
        id: number
      }
    }
    loanAsset: {
      symbol: string
      address: string
      decimals: number
    }
    collateralAsset: {
      symbol: string
      address: string
      decimals: number
    }
    badDebt: { usd: number }
    realizedBadDebt: { usd: number }
    state: {
      avgSupplyApy: number
      netSupplyApy: number
      supplyAssets: string
      supplyShares: string
    }
  }
  state: {
    supplyShares: string
    borrowShares: string
    collateral: string
  }
}

export interface QueryMarketPositionsResult {
  marketPositions: {
    items: MarketPosition[]
  }
}

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
        state {
          supplyShares
          borrowShares
          collateral
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
