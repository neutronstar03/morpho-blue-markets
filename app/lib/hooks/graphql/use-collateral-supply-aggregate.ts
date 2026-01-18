import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { gql } from 'graphql-request'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
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
interface CollateralSupplyCache {
  data: number | undefined
  updatedAt: number
}

export function useCollateralSupplyAggregate({
  chainId,
  collateralAddress,
}: UseCollateralSupplyAggregateArgs) {
  const collateralLower = collateralAddress?.toLowerCase()
  const enabled = !!chainId && !!collateralLower

  const storageKey = useMemo(
    () => ['collateral-supply-agg', chainId, collateralLower ?? ''].join(':'),
    [chainId, collateralLower],
  )

  const [cached, setCached] = useLocalStorage<CollateralSupplyCache>(
    storageKey,
    { data: undefined, updatedAt: 0 },
  )

  const initialData = cached.updatedAt > 0 ? cached.data : undefined

  const query = useQuery<number | undefined>({
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
    staleTime: STALE_TIME_LONG_MS,
    refetchOnWindowFocus: false,
    ...(initialData !== undefined ? { initialData } : {}),
  })

  useEffect(() => {
    if (query.data == null)
      return
    setCached({ data: query.data, updatedAt: Date.now() })
  }, [query.data, setCached])

  return query
}
