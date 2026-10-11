// Edge-cached API endpoint: GET /api/popular-loan-assets
// Caches normalized Morpho GraphQL "interesting markets" data at the Cloudflare
// edge (120s TTL) and returns the normalized { data: { markets: { items } } }
// envelope the frontend consumes as placeholderData.
//
// The upstream payload is validated before caching: a malformed body or a
// GraphQL error responds 502 and is never cached.

import { MORPHO_GRAPHQL_URL } from '../../app/lib/graphql/endpoint'
import { parsePopularLoanAssetsEnvelope, QUERY_POPULAR_LOAN_ASSETS } from '../../app/lib/graphql/queries/popular-loan-assets'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

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
          query: QUERY_POPULAR_LOAN_ASSETS,
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

      if (!response.ok)
        throw new Error(`Upstream error: ${response.status} ${response.statusText}`)

      const payload: unknown = await response.json()
      return { data: parsePopularLoanAssetsEnvelope(payload) }
    },
  })
}
