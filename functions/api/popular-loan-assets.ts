import { MORPHO_GRAPHQL_URL } from '../../app/lib/graphql/endpoint'
// Edge-cached API endpoint: GET /api/popular-loan-assets
// Caches normalized Morpho GraphQL "interesting markets" data at the Cloudflare
// edge (120s TTL) and returns the normalized { data: { markets: { items } } }
// envelope the frontend consumes as placeholderData.
//
// The upstream payload is validated before caching: a malformed body or a
// GraphQL error responds 502 and is never cached.

import { parsePopularLoanAssetsEnvelope, QUERY_POPULAR_LOAN_ASSETS } from '../../app/lib/graphql/queries/popular-loan-assets'
import { fetchWithDeadline } from '../../app/lib/graphql/request-policy'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 120

interface Env {}

function numericParam(params: URLSearchParams, name: string, fallback: number): number {
  const raw = params.get(name)
  return raw === null ? fallback : raw.trim() === '' ? Number.NaN : Number(raw)
}

function isGraphqlInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainId = numericParam(url.searchParams, 'chainId', Number.NaN)
  if (!url.searchParams.has('chainId'))
    return errorResponse('Missing chainId', 400)

  // Only absent filters use defaults; zero is an explicit frontend value.
  const first = numericParam(url.searchParams, 'first', 100)
  const skip = numericParam(url.searchParams, 'skip', 0)
  const minNetSupplyApy = numericParam(url.searchParams, 'minNetSupplyApy', 0.05)
  const maxNetSupplyApy = numericParam(url.searchParams, 'maxNetSupplyApy', 10)
  const minBorrowUsd = numericParam(url.searchParams, 'minBorrowUsd', 10_000)
  const minUtilization = numericParam(url.searchParams, 'minUtilization', 0.1)

  if (!isGraphqlInt(chainId) || chainId === 0 || !isGraphqlInt(first) || !isGraphqlInt(skip))
    return errorResponse('chainId must be a positive GraphQL Int; first and skip must be non-negative GraphQL Int values', 400)
  if (![minNetSupplyApy, maxNetSupplyApy, minBorrowUsd, minUtilization].every(Number.isFinite)
    || minNetSupplyApy > maxNetSupplyApy || minBorrowUsd < 0 || minUtilization < 0 || minUtilization > 1) {
    return errorResponse('Invalid numeric market filters', 400)
  }

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: promise => context.waitUntil(promise),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const response = await fetchWithDeadline(MORPHO_GRAPHQL_URL, {
        method: 'POST',
        signal: context.request.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: QUERY_POPULAR_LOAN_ASSETS,
          variables: {
            first,
            skip,
            chainId,
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
