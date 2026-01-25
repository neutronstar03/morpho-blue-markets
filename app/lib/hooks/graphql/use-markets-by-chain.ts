import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { useMemo } from 'react'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
import { filterBlacklistedMarkets } from '~/lib/market-blacklist'
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
    chain?: {
      id: number
      network?: string | null
    }
  }
  collateralAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  state: {
    netSupplyApy: number
    supplyApy: number
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
          chain { id network }
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          netSupplyApy
          supplyApy
          supplyAssets
          supplyShares
          supplyAssetsUsd
        }
      }
    }
  }
`

export function useMarketsByChain(chainId?: number, loanAssetAddress?: string) {
  const loanAssetAddrLower = loanAssetAddress?.toLowerCase()

  const query = useQuery<SupplyMarketData[]>({
    queryKey: ['markets-by-chain', chainId, loanAssetAddrLower],
    queryFn: async () => {
      if (!chainId)
        return []

      const first = 200
      let skip = 0

      const where: MarketFiltersWithChain & { loanAssetAddress_in?: string[] } = { chainId_in: [chainId] }
      if (loanAssetAddrLower)
        where.loanAssetAddress_in = [loanAssetAddrLower]

      const markets: SupplyMarketData[] = []

      while (true) {
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
        const pageItems = result.markets.items || []
        markets.push(...pageItems)

        if (pageItems.length < first)
          break

        skip += first
      }

      return filterBlacklistedMarkets(markets, market => ({
        uniqueKey: market.uniqueKey,
        loanAssetAddress: market.loanAsset?.address,
        collateralAssetAddress: market.collateralAsset?.address,
        loanAssetSymbol: market.loanAsset?.symbol,
        collateralAssetSymbol: market.collateralAsset?.symbol,
        chainId,
      }))
    },
    enabled: !!chainId,
    staleTime: STALE_TIME_LONG_MS,
    refetchOnWindowFocus: false,
  })

  // Defensive: during chain/asset switching, React Query can briefly surface previous data.
  // Filter by the requested loanAssetAddress so we never render mismatched markets.
  const filteredData = useMemo(() => {
    const data = query.data
    if (!data)
      return data

    let out = data

    if (loanAssetAddrLower)
      out = out.filter(m => (m.loanAsset?.address || '').toLowerCase() === loanAssetAddrLower)

    return out
  }, [chainId, loanAssetAddrLower, query.data])

  return {
    ...query,
    data: filteredData,
  }
}
