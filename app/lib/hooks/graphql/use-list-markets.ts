import type { MarketFilters, MarketOrderBy, MorphoMarket, OrderDirection, QueryMarketsResult } from '~/lib/graphql/queries/list-markets'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { parseMarketListResponse } from '~/lib/graphql/market-responses'
import { QUERY_LIST_MARKETS } from '~/lib/graphql/queries/list-markets'
import { graphqlRetryDelay, shouldRetryGraphqlRequest } from '~/lib/graphql/request-policy'
import { useFilteredBlacklistedMarkets } from '~/lib/market-blacklist'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'
import { graphqlClient } from '../../graphql/client'

interface UseMarketsProps {
  where: MarketFilters
  orderBy: MarketOrderBy
  orderDirection: OrderDirection
  first?: number
  skip?: number
  staleTime?: number
}

export function useMarkets({
  where,
  orderBy,
  orderDirection,
  first = 100,
  skip = 0,
  staleTime = 1 * 60 * 1000, // 1 minute
}: UseMarketsProps) {
  const query = useQuery<QueryMarketsResult>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['markets', where, orderBy, orderDirection, first, skip],
    queryFn: async ({ signal }) => {
      const result = await graphqlClient.request<unknown>({ document: QUERY_LIST_MARKETS, variables: {
        where,
        orderBy,
        orderDirection,
        first,
        skip,
      }, signal })
      return parseMarketListResponse(result)
    },
    staleTime,
  })

  const getMarketBlacklistArgs = useCallback((market: MorphoMarket) => ({
    uniqueKey: market.uniqueKey,
    loanAssetAddress: market.loanAsset?.address,
    collateralAssetAddress: market.collateralAsset?.address,
    loanAssetSymbol: market.loanAsset?.symbol,
    collateralAssetSymbol: market.collateralAsset?.symbol,
    oracleAddress: market.oracleAddress,
    chainId: market.morphoBlue?.chain?.id,
  }), [])
  const locallyVisibleMarkets = useFilteredBlacklistedMarkets(query.data?.markets.items, getMarketBlacklistArgs)

  const filteredData = useMemo<QueryMarketsResult | undefined>(() => {
    const data = query.data
    if (!data)
      return data

    return {
      ...data,
      markets: {
        items: locallyVisibleMarkets.filter(market => !isOracleMisconfiguredWarning(market.warnings)),
      },
    }
  }, [locallyVisibleMarkets, query.data])

  return {
    ...query,
    data: filteredData,
  }
}

export { QUERY_LIST_MARKETS } from '~/lib/graphql/queries/list-markets'

export { MarketOrderBy, OrderDirection } from '~/lib/graphql/queries/list-markets'
export type { MarketFilters, MorphoMarket, QueryMarketsResult } from '~/lib/graphql/queries/list-markets'
