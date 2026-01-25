import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
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
  oraclePriceUsd?: number | null
  /** Sum of `state.borrowAssetsUsd` across interesting markets for this asset. */
  borrowUsdSum: number
  /** Number of interesting markets counted for this asset. */
  marketCount: number
  /** BorrowUSD-weighted average of `state.netSupplyApy` across interesting markets. */
  averageApy: number
}

interface InterestingMarketItem {
  uniqueKey: string
  loanAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
    oraclePriceUsd?: number | null
    chain: { id: number, network?: string | null }
  }
  state: {
    borrowAssetsUsd?: number | null
    netSupplyApy?: number | null
    utilization: number
  }
}

interface QueryInterestingMarketsResult {
  markets: {
    items: InterestingMarketItem[]
  }
}

export const QUERY_INTERESTING_MARKETS = gql`
  query InterestingMarkets(
    $first: Int = 100
    $skip: Int = 0
    $chainId: Int = 1
    $minNetSupplyApy: Float = 0.05
    $maxNetSupplyApy: Float = 10
    $minBorrowUsd: Float = 10000
    $minUtilization: Float = 0.1
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: NetSupplyApy
      orderDirection: Desc
      where: {
        chainId_in: [$chainId]
        netSupplyApy_gte: $minNetSupplyApy
        netSupplyApy_lte: $maxNetSupplyApy
        borrowAssetsUsd_gte: $minBorrowUsd
        utilization_gte: $minUtilization
      }
    ) {
      items {
        uniqueKey
        loanAsset {
          address
          symbol
          name
          decimals
          chain { id network }
          oraclePriceUsd
        }
        state {
          utilization
          borrowAssetsUsd
          netSupplyApy
        }
      }
    }
  }
`

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

      const result = await graphqlClient.request<QueryInterestingMarketsResult>(
        QUERY_INTERESTING_MARKETS,
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

      const byAddr = new Map<string, PopularLoanAsset>()
      const apyWeightedSumByAddr = new Map<string, number>()
      const apyWeightByAddr = new Map<string, number>()

      for (const m of (result.markets.items ?? [])) {
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
            oraclePriceUsd: m.loanAsset.oraclePriceUsd,
            borrowUsdSum: borrowUsd,
            marketCount: 1,
            averageApy: 0,
          })
          continue
        }

        prev.borrowUsdSum += borrowUsd
        prev.marketCount += 1
        // Prefer any defined oracle price.
        if ((prev.oraclePriceUsd == null || !Number.isFinite(prev.oraclePriceUsd)) && m.loanAsset.oraclePriceUsd != null)
          prev.oraclePriceUsd = m.loanAsset.oraclePriceUsd
        // Prefer any defined decimals/name.
        if (prev.decimals == null && m.loanAsset.decimals != null)
          prev.decimals = m.loanAsset.decimals
        if (prev.name == null && m.loanAsset.name != null)
          prev.name = m.loanAsset.name
      }

      const items = [...byAddr.values()]
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

      return items.slice(0, topN)
    },
    enabled: !!chainId && enabled,
    staleTime: staleTimeMs,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
  })

  return query
}
