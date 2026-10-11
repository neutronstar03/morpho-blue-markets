import type { SingleMorphoMarket, SingleMorphoMarketResult } from '~/lib/graphql/queries/market-detail'
import { useQuery } from '@tanstack/react-query'
import { request } from 'graphql-request'
import { MORPHO_GRAPHQL_URL } from '~/lib/graphql/endpoint'
import { QUERY_SINGLE_MORPHO_MARKET } from '~/lib/graphql/queries/market-detail'
import { STALE_TIME_SHORT_MS } from '~/lib/hooks/query-stale-times'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'

// Re-exported so the existing market-page consumers keep their import path.
export type { SingleMorphoMarket } from '~/lib/graphql/queries/market-detail'

export function useMarketQuery(uniqueKey?: string, chainId?: number) {
  return useQuery({
    queryKey: ['market', uniqueKey, chainId],
    queryFn: async () => {
      if (!uniqueKey || !chainId)
        return null
      const { marketById } = await request<SingleMorphoMarketResult>(
        MORPHO_GRAPHQL_URL,
        QUERY_SINGLE_MORPHO_MARKET,
        {
          marketId: uniqueKey,
          chainId,
        },
      )
      const market: SingleMorphoMarket | null = marketById
      if (!market)
        return null
      if (isOracleMisconfiguredWarning(market.warnings))
        return null
      return market
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: STALE_TIME_SHORT_MS,
  })
}
