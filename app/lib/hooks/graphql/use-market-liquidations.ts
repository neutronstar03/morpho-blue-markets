import { useQuery } from '@tanstack/react-query'
import { graphqlClient } from '~/lib/graphql/client'
import { GetMarketLiquidationCount, parseLiquidationCount } from '~/lib/graphql/queries/market-liquidations'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'

export function useMarketLiquidations(uniqueKey?: string, chainId?: number) {
  return useQuery<number>({
    queryKey: ['market-liquidations', uniqueKey, chainId],
    queryFn: async () => {
      if (!uniqueKey || !chainId)
        return 0

      const result = await graphqlClient.request<unknown>(
        GetMarketLiquidationCount,
        { uniqueKey, chainId },
      )

      return parseLiquidationCount(result)
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: STALE_TIME_LONG_MS,
  })
}
