import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '~/lib/graphql/client'

interface QueryCollateralSupplyAggregateResult {
  markets: {
    items: Array<{
      state: {
        supplyAssetsUsd?: number | null
      }
    }>
  }
}

const QUERY_COLLATERAL_SUPPLY_AGGREGATE = gql`
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

export interface UseCollateralSupplyAggregateArgs {
  chainId?: number
  collateralAddress?: string
}

/**
 * Aggregates `supplyAssetsUsd` across all markets on the same chain that share the same collateral address.
 *
 * NOTE: intentionally not paginated (assumes <= 200 markets per collateral+chain).
 */
export function useCollateralSupplyAggregate({
  chainId,
  collateralAddress,
}: UseCollateralSupplyAggregateArgs) {
  const collateralLower = collateralAddress?.toLowerCase()
  const enabled = !!chainId && !!collateralLower

  return useQuery<number | undefined>({
    queryKey: ['collateral-supply-agg', chainId, collateralLower],
    queryFn: async () => {
      if (!chainId || !collateralLower)
        return undefined

      const first = 200
      const skip = 0

      const where = {
        chainId_in: [chainId],
        collateralAssetAddress_in: [collateralLower],
      }

      const res = await graphqlClient.request<QueryCollateralSupplyAggregateResult>(
        QUERY_COLLATERAL_SUPPLY_AGGREGATE,
        { first, skip, where },
      )

      const sum = (res.markets?.items || []).reduce((acc, m) => {
        const v = m.state?.supplyAssetsUsd
        return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0)
      }, 0)

      return sum > 0 ? sum : 0
    },
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
