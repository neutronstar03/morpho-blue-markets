import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { useEffect, useMemo } from 'react'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
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

interface MarketsByChainCache {
  data: SupplyMarketData[]
  updatedAt: number
}

export function useMarketsByChain(chainId?: number, loanAssetAddress?: string) {
  const storageKey = useMemo(
    () => ['markets-by-chain', chainId, loanAssetAddress ?? 'all'].join(':'),
    [chainId, loanAssetAddress],
  )

  const [cached, setCached] = useLocalStorage<MarketsByChainCache>(
    storageKey,
    { data: [], updatedAt: 0 },
  )

  const initialData = cached.updatedAt > 0 ? cached.data : undefined

  const query = useQuery<SupplyMarketData[]>({
    queryKey: ['markets-by-chain', chainId, loanAssetAddress],
    queryFn: async () => {
      if (!chainId)
        return []

      const first = 200
      let skip = 0

      const where: MarketFiltersWithChain & { loanAssetAddress_in?: string[] } = { chainId_in: [chainId] }
      if (loanAssetAddress)
        where.loanAssetAddress_in = [loanAssetAddress]

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
    ...(initialData ? { initialData } : {}),
  })

  useEffect(() => {
    if (!query.data)
      return
    setCached({ data: query.data, updatedAt: Date.now() })
  }, [query.data, setCached])

  return query
}
