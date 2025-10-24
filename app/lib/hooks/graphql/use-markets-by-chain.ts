import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '../../graphql/client'

// A specific, isolated type for this hook, containing only the fields required
// for the supply-side of the `useLiveMarketPositions` hook.
export interface SupplyMarketData {
  uniqueKey: string
  loanAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  collateralAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  state: {
    netSupplyApy: number
    supplyAssets: string
    supplyShares: string
    supplyAssetsUsd?: number
  }
}

interface MarketFiltersWithChain { chainId_in?: number[] }
enum MarketOrderBy { NetSupplyApy = 'NetSupplyApy' }
enum OrderDirection { Desc = 'Desc' }

interface QueryMarketsByChainResult {
  markets: {
    items: SupplyMarketData[]
  }
}

// This query is self-contained and fetches only the minimal fields required
// for the supply-side of the `useLiveMarketPositions` hook.
export const QUERY_MARKETS_BY_CHAIN = gql`
  query GetMarketsByChain(
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
        uniqueKey
        loanAsset {
          address
          symbol
          name
          decimals
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          netSupplyApy
          supplyAssets
          supplyShares
          supplyAssetsUsd
        }
      }
    }
  }
`

export function useMarketsByChain(chainId?: number) {
  return useQuery<SupplyMarketData[]>({
    queryKey: ['markets-by-chain', chainId],
    queryFn: async () => {
      if (!chainId)
        return []

      let markets: SupplyMarketData[] = []
      let skip = 0
      const first = 1000
      let hasMore = true

      while (hasMore) {
        const result = await graphqlClient.request<QueryMarketsByChainResult>(
          QUERY_MARKETS_BY_CHAIN,
          {
            where: { chainId_in: [chainId] } as MarketFiltersWithChain,
            orderBy: MarketOrderBy.NetSupplyApy,
            orderDirection: OrderDirection.Desc,
            first,
            skip,
          },
        )
        const newMarkets = result.markets.items || []
        markets = markets.concat(newMarkets)

        if (newMarkets.length < first) {
          hasMore = false
        }
        else {
          skip += first
        }
      }
      return markets
    },
    enabled: !!chainId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
