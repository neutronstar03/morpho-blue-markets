import type { SingleMorphoMarket } from '~/lib/graphql/queries/market-detail'
import { useQuery } from '@tanstack/react-query'
import { graphqlClient } from '~/lib/graphql/client'
import { parseMarketDetailResponse } from '~/lib/graphql/market-responses'
import { QUERY_SINGLE_MORPHO_MARKET } from '~/lib/graphql/queries/market-detail'
import { graphqlRetryDelay, shouldRetryGraphqlRequest } from '~/lib/graphql/request-policy'
import { STALE_TIME_SHORT_MS } from '~/lib/hooks/query-stale-times'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'

// Re-exported so the existing market-page consumers keep their import path.
export type { SingleMorphoMarket } from '~/lib/graphql/queries/market-detail'

export function useMarketQuery(uniqueKey?: string, chainId?: number) {
  return useQuery<SingleMorphoMarket | null, Error>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['market', uniqueKey, chainId],
    queryFn: async ({ signal }) => {
      if (!uniqueKey || !chainId)
        return null
      const raw = await graphqlClient.request<unknown>({
        document: QUERY_SINGLE_MORPHO_MARKET,
        variables: { marketId: uniqueKey, chainId },
        signal,
      })
      const market = parseMarketDetailResponse(raw)
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
