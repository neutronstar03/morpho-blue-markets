import type { PopularLoanAssetsEnvelope, PopularLoanAssetsMarketItem, PopularLoanAssetsQueryResult } from '~/lib/graphql/queries/popular-loan-assets'
import { useQuery } from '@tanstack/react-query'
import { QUERY_POPULAR_LOAN_ASSETS } from '~/lib/graphql/queries/popular-loan-assets'
import { STALE_TIME_LONG_MS } from '~/lib/hooks/query-stale-times'
import { isAssetBlacklisted } from '~/lib/market-blacklist'
import { graphqlClient } from '../../graphql/client'

export interface PopularLoanAsset {
  address: string
  symbol: string
  name?: string | null
  decimals?: number | null
  chainId: number
  chainNetwork?: string | null
  priceUsd?: number | null
  /** Sum of `state.borrowAssetsUsd` across interesting markets for this asset. */
  borrowUsdSum: number
  /** Number of interesting markets counted for this asset. */
  marketCount: number
  /** BorrowUSD-weighted average of `state.netSupplyApy` across interesting markets. */
  averageApy: number
}

/** Process raw GraphQL market items into sorted, aggregated PopularLoanAsset[]. */
export function aggregatePopularLoanAssets(items: PopularLoanAssetsMarketItem[], topN: number): PopularLoanAsset[] {
  const byAddr = new Map<string, PopularLoanAsset>()
  const apyWeightedSumByAddr = new Map<string, number>()
  const apyWeightByAddr = new Map<string, number>()

  for (const m of items) {
    const assetChainId = m.loanAsset.chain.id
    if (isAssetBlacklisted(m.loanAsset.address, assetChainId))
      continue

    const addr = m.loanAsset.address.toLowerCase()
    const borrowUsd = m.state.borrowAssetsUsd ?? 0
    const netSupplyApy = m.state.netSupplyApy ?? 0

    // Track borrowUSD-weighted APY aggregates.
    if (Number.isFinite(borrowUsd) && borrowUsd > 0 && Number.isFinite(netSupplyApy)) {
      apyWeightedSumByAddr.set(addr, (apyWeightedSumByAddr.get(addr) ?? 0) + borrowUsd * netSupplyApy)
      apyWeightByAddr.set(addr, (apyWeightByAddr.get(addr) ?? 0) + borrowUsd)
    }

    const prev = byAddr.get(addr)
    if (!prev) {
      byAddr.set(addr, {
        address: m.loanAsset.address,
        symbol: m.loanAsset.symbol,
        name: m.loanAsset.name,
        decimals: m.loanAsset.decimals,
        chainId: assetChainId,
        chainNetwork: m.loanAsset.chain.network,
        priceUsd: m.loanAsset.price?.usd,
        borrowUsdSum: borrowUsd,
        marketCount: 1,
        averageApy: 0,
      })
      continue
    }

    prev.borrowUsdSum += borrowUsd
    prev.marketCount += 1
    // Prefer any defined oracle price.
    if ((prev.priceUsd == null || !Number.isFinite(prev.priceUsd)) && m.loanAsset.price?.usd != null)
      prev.priceUsd = m.loanAsset.price.usd
    // Prefer any defined decimals/name.
    if (prev.decimals == null && m.loanAsset.decimals != null)
      prev.decimals = m.loanAsset.decimals
    if (prev.name == null && m.loanAsset.name != null)
      prev.name = m.loanAsset.name
  }

  return [...byAddr.values()]
    .map((x) => {
      const key = x.address.toLowerCase()
      const wSum = apyWeightedSumByAddr.get(key) ?? 0
      const w = apyWeightByAddr.get(key) ?? 0
      const averageApy = w > 0 ? (wSum / w) : 0
      return { ...x, averageApy }
    })
    .filter(x => Number.isFinite(x.borrowUsdSum) && x.borrowUsdSum > 0)
    .sort((a, b) => {
      if (a.averageApy !== b.averageApy)
        return b.averageApy - a.averageApy
      return b.borrowUsdSum - a.borrowUsdSum
    })
    .slice(0, topN)
}

export interface UsePopularLoanAssetsByChainOptions {
  first?: number
  skip?: number
  minNetSupplyApy?: number
  maxNetSupplyApy?: number
  minBorrowUsd?: number
  minUtilization?: number
  topN?: number
  enabled?: boolean
  staleTimeMs?: number
}

export function usePopularLoanAssetsByChain(chainId?: number, opts: UsePopularLoanAssetsByChainOptions = {}) {
  const {
    first = 100,
    skip = 0,
    minNetSupplyApy = 0.05,
    maxNetSupplyApy = 10,
    minBorrowUsd = 10_000,
    minUtilization = 0.1,
    topN = 12,
    enabled = true,
    staleTimeMs = STALE_TIME_LONG_MS,
  } = opts

  // Edge-cached placeholder: fetches pre-processed data from our edge cache
  // for instant first paint while the live GraphQL query runs in background.
  const edgeQuery = useQuery<PopularLoanAsset[]>({
    queryKey: ['edge-cached', 'popular-loan-assets', chainId, first, skip, minNetSupplyApy, maxNetSupplyApy, minBorrowUsd, minUtilization, topN],
    queryFn: async () => {
      if (!chainId)
        return []
      const params = new URLSearchParams({
        chainId: String(chainId),
        first: String(first),
        skip: String(skip),
        minNetSupplyApy: String(minNetSupplyApy),
        maxNetSupplyApy: String(maxNetSupplyApy),
        minBorrowUsd: String(minBorrowUsd),
        minUtilization: String(minUtilization),
      })
      const res = await fetch(`/api/popular-loan-assets?${params}`)
      if (!res.ok)
        throw new Error(`Edge cache error: ${res.status}`)
      const raw = await res.json() as PopularLoanAssetsEnvelope
      return aggregatePopularLoanAssets(raw.data.markets.items, topN)
    },
    enabled: !!chainId && enabled,
    staleTime: STALE_TIME_LONG_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })

  const query = useQuery<PopularLoanAsset[]>({
    queryKey: [
      'popular-loan-assets-by-chain',
      chainId,
      first,
      skip,
      minNetSupplyApy,
      maxNetSupplyApy,
      minBorrowUsd,
      minUtilization,
      topN,
    ],
    queryFn: async () => {
      if (!chainId)
        return []

      const result = await graphqlClient.request<PopularLoanAssetsQueryResult>(
        QUERY_POPULAR_LOAN_ASSETS,
        {
          first,
          skip,
          chainId,
          minNetSupplyApy,
          maxNetSupplyApy,
          minBorrowUsd,
          minUtilization,
        },
      )

      return aggregatePopularLoanAssets(result.markets.items, topN)
    },
    enabled: !!chainId && enabled,
    placeholderData: edgeQuery.data,
    staleTime: staleTimeMs,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })

  return query
}
