import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'
import { graphqlClient } from '../../graphql/client'

// Data returned from the GraphQL query for each position
export interface UserPosition {
  market: {
    uniqueKey: string
    loanAsset: {
      symbol: string
      decimals: number
      address: string
    }
    collateralAsset: {
      symbol: string
      decimals: number
      address: string
    }
    oracle: {
      address: string
    } | null
    irmAddress: string
    lltv: string
    warnings?: Array<{
      type: string
      level: 'YELLOW' | 'RED'
    }>
    state: {
      netSupplyApy: number
      supplyAssets: string
      supplyShares: string
      supplyAssetsUsd: number | null
    }
  }
  state: {
    supplyShares: string
    borrowShares: string
    collateral: string
  }
}

interface QueryUserPositionsResult {
  marketPositions: {
    items: UserPosition[]
  }
}

// Query to get user's positions on a specific chain
// This is the efficient discovery query - only fetches markets where user has a position
export const QUERY_USER_POSITIONS = gql`
  query GetUserPositions($user: String!, $chainId: Int!) {
    marketPositions(
      where: { userAddress_in: [$user], chainId_in: [$chainId] }
      first: 100
    ) {
      items {
        market {
          uniqueKey
          loanAsset {
            symbol
            decimals
            address
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
            supplyAssets
            supplyShares
            supplyAssetsUsd
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

export function useUserPositions(userAddress?: string, chainId?: number) {
  return useQuery<UserPosition[]>({
    queryKey: ['user-positions-graph', userAddress, chainId],
    queryFn: async () => {
      if (!userAddress || !chainId)
        return []

      const result = await graphqlClient.request<QueryUserPositionsResult>(
        QUERY_USER_POSITIONS,
        {
          user: userAddress,
          chainId,
        },
      )

      const positions = (result.marketPositions.items || []).filter((p) => {
        const supplyShares = BigInt(p.state.supplyShares || '0')
        return supplyShares > 0n
      })
      return positions.filter(position => !isOracleMisconfiguredWarning(position.market.warnings))
    },
    enabled: !!userAddress && !!chainId,
    staleTime: 30 * 1000, // 30 seconds - positions don't change that often
  })
}
