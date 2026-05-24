import type { QueryMarketsByChainResult, SupplyMarketData } from '~/lib/graphql/queries/markets-by-chain'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { MarketOrderBy, OrderDirection, QUERY_MARKETS_BY_CHAIN } from '~/lib/graphql/queries/markets-by-chain'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
import { filterBlacklistedMarkets, useMarketBlacklistVersion } from '~/lib/market-blacklist'
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
  const blacklistVersion = useMarketBlacklistVersion()
  const loanAssetAddrLower = loanAssetAddress?.toLowerCase()
  const {
    minNetSupplyApy,
    maxNetSupplyApy,
    minBorrowUsd,
  } = opts

  const query = useQuery<SupplyMarketData[]>({
    queryKey: ['markets-by-chain', chainId, loanAssetAddrLower, minNetSupplyApy, maxNetSupplyApy, minBorrowUsd, blacklistVersion],
    queryFn: async () => {
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
        oracleAddress: market.oracleAddress,
        chainId,
      })).filter(m => !isOracleMisconfiguredWarning(m.warnings))
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
