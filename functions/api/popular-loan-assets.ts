// Edge-cached API endpoint: GET /api/popular-loan-assets
// Caches Morpho GraphQL "interesting markets" data at the Cloudflare edge (120s TTL).
// Returns the raw GraphQL response JSON so the frontend can use it as placeholderData.

import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

// GraphQL query string matching the frontend's QUERY_INTERESTING_MARKETS
// (from use-popular-loan-assets-by-chain.ts).
// Keep in sync with the frontend query — it changes rarely but must match exactly.
const QUERY_INTERESTING_MARKETS = `
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
        marketId
        uniqueKey: marketId
        loanAsset {
          address
          symbol
          name
          decimals
          chain { id network }
          price { usd }
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

const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql'
const CACHE_TTL_SECONDS = 120

interface Env {}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainId = url.searchParams.get('chainId')
  if (!chainId)
    return errorResponse('Missing chainId', 400)

  // Parse optional filter params with defaults matching the frontend hook
  const first = Number(url.searchParams.get('first')) || 100
  const skip = Number(url.searchParams.get('skip')) || 0
  const minNetSupplyApy = Number(url.searchParams.get('minNetSupplyApy')) || 0.05
  const maxNetSupplyApy = Number(url.searchParams.get('maxNetSupplyApy')) || 10
  const minBorrowUsd = Number(url.searchParams.get('minBorrowUsd')) || 10_000
  const minUtilization = Number(url.searchParams.get('minUtilization')) || 0.1

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const response = await fetch(MORPHO_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: QUERY_INTERESTING_MARKETS,
          variables: {
            first,
            skip,
            chainId: Number(chainId),
            minNetSupplyApy,
            maxNetSupplyApy,
            minBorrowUsd,
            minUtilization,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Upstream error: ${response.status} ${response.statusText}`)
      }

      return { data: await response.json() }
    },
  })
}
