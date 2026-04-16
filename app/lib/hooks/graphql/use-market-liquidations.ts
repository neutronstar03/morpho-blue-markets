import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { graphqlClient } from '~/lib/graphql/client'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'

const GetMarketLiquidationCount = gql`
  query GetMarketLiquidationCount($uniqueKey: String!, $chainId: Int!) {
    transactions(
      first: 1
      where: { marketUniqueKey_in: [$uniqueKey], chainId_in: [$chainId], type_in: [MarketLiquidation] }
    ) {
      pageInfo { countTotal }
    }
  }
`

interface QueryResult {
  transactions: {
    pageInfo: {
      countTotal: number
    }
  }
}

export function useMarketLiquidations(uniqueKey?: string, chainId?: number) {
  return useQuery<number>({
    queryKey: ['market-liquidations', uniqueKey, chainId],
    queryFn: async () => {
      if (!uniqueKey || !chainId)
        return 0

      const result = await graphqlClient.request<QueryResult>(
        GetMarketLiquidationCount,
        { uniqueKey, chainId },
      )

      return result.transactions.pageInfo.countTotal
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: STALE_TIME_LONG_MS,
  })
}
