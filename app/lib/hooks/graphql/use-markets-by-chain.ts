import type { SupplyMarketData } from '~/lib/graphql/queries/markets-by-chain'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { parseOptimizerMarketPage } from '~/lib/graphql/market-responses'
import { MarketOrderBy, OrderDirection, QUERY_MARKETS_BY_CHAIN } from '~/lib/graphql/queries/markets-by-chain'
import { graphqlRetryDelay, shouldRetryGraphqlRequest } from '~/lib/graphql/request-policy'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
import { useFilteredBlacklistedMarkets } from '~/lib/market-blacklist'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'
import { graphqlClient } from '../../graphql/client'

interface MarketFiltersWithChain {
  chainId_in?: number[]
  loanAssetAddress_in?: string[]
  netSupplyApy_gte?: number
  netSupplyApy_lte?: number
  borrowAssetsUsd_gte?: number
}

export interface UseMarketsByChainOptions {
  minNetSupplyApy?: number
  maxNetSupplyApy?: number
  minBorrowUsd?: number
}

export function useMarketsByChain(chainId?: number, loanAssetAddress?: string, opts: UseMarketsByChainOptions = {}) {
  const loanAssetAddrLower = loanAssetAddress?.toLowerCase()
  const {
    minNetSupplyApy,
    maxNetSupplyApy,
    minBorrowUsd,
  } = opts

  const query = useQuery<SupplyMarketData[]>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['markets-by-chain', chainId, loanAssetAddrLower, minNetSupplyApy, maxNetSupplyApy, minBorrowUsd],
    queryFn: async ({ signal }) => {
      if (!chainId)
        return []

      const first = 200
      let skip = 0

      const where: MarketFiltersWithChain = { chainId_in: [chainId] }
      if (loanAssetAddrLower)
        where.loanAssetAddress_in = [loanAssetAddrLower]
      if (Number.isFinite(minNetSupplyApy))
        where.netSupplyApy_gte = minNetSupplyApy
      if (Number.isFinite(maxNetSupplyApy))
        where.netSupplyApy_lte = maxNetSupplyApy
      if (Number.isFinite(minBorrowUsd))
        where.borrowAssetsUsd_gte = minBorrowUsd

      const markets: SupplyMarketData[] = []

      while (true) {
        const result = await graphqlClient.request<unknown>({ document: QUERY_MARKETS_BY_CHAIN, variables: {
          where,
          orderBy: MarketOrderBy.NetSupplyApy,
          orderDirection: OrderDirection.Desc,
          first,
          skip,
        }, signal })
        const page = parseOptimizerMarketPage(result, chainId)
        markets.push(...page.items)

        if (page.rawCount < first)
          break

        skip += first
      }

      return markets
    },
    enabled: !!chainId,
    staleTime: STALE_TIME_LONG_MS,
    refetchOnWindowFocus: false,
  })

  // Defensive: during chain/asset switching, React Query can briefly surface previous data.
  // Filter by the requested loanAssetAddress so we never render mismatched markets.
  const getMarketBlacklistArgs = useCallback((market: SupplyMarketData) => ({
    uniqueKey: market.uniqueKey,
    loanAssetAddress: market.loanAsset?.address,
    collateralAssetAddress: market.collateralAsset?.address,
    loanAssetSymbol: market.loanAsset?.symbol,
    collateralAssetSymbol: market.collateralAsset?.symbol,
    oracleAddress: market.oracleAddress,
    chainId,
  }), [chainId])
  const locallyVisibleMarkets = useFilteredBlacklistedMarkets(query.data, getMarketBlacklistArgs)

  const filteredData = useMemo(() => {
    const data = query.data
    if (!data)
      return data

    let out = locallyVisibleMarkets.filter(m => !isOracleMisconfiguredWarning(m.warnings))

    if (loanAssetAddrLower)
      out = out.filter(m => (m.loanAsset?.address || '').toLowerCase() === loanAssetAddrLower)

    return out
  }, [loanAssetAddrLower, locallyVisibleMarkets, query.data])

  return {
    ...query,
    data: filteredData,
  }
}
