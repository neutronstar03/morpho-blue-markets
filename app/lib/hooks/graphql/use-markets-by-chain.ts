import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '../../graphql/client'

// A specific, isolated type for this hook, containing only the fields required
// for the supply-side of the `useLiveMarketPositions` hook.
export interface SupplyMarketData {
  uniqueKey: string
  irmAddress: string
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
        irmAddress
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

export function useMarketsByChain(chainId?: number, loanAssetAddress?: string) {
  return useQuery<SupplyMarketData[]>({
    queryKey: ['markets-by-chain', chainId, loanAssetAddress],
    queryFn: async () => {
      if (!chainId)
        return []

      const first = 200
      const skip = 0

      const where: MarketFiltersWithChain & { loanAssetAddress_in?: string[] } = { chainId_in: [chainId] }
      if (loanAssetAddress)
        where.loanAssetAddress_in = [loanAssetAddress]

      const result = await graphqlClient.request<QueryMarketsByChainResult>(
        QUERY_MARKETS_BY_CHAIN,
        {
          where,
          orderBy: MarketOrderBy.NetSupplyApy,
          orderDirection: OrderDirection.Desc,
          first,
          skip,
        },
      )
      return result.markets.items || []
    },
    enabled: !!chainId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
