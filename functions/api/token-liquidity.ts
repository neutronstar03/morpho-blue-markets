import { chainProviderSlugMap } from '../../app/lib/chain-capabilities'
// Edge-cached API endpoint: GET /api/token-liquidity
// Caches GeckoTerminal token liquidity data at the Cloudflare edge (3600s TTL = 1 hour).
// Returns { liquidityUsd: string | null } — null means "no liquidity data found" and is
// cached for a shorter period (300s = 5min) to avoid re-hammering GeckoTerminal.

import { fetchWithDeadline } from '../../app/lib/graphql/request-policy'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const GECKOTERMINAL_BASE_URL = 'https://api.geckoterminal.com/api/v2'
const CACHE_TTL_SECONDS = 3600 // 1 hour for successful results
const NEGATIVE_CACHE_TTL_SECONDS = 300 // 5 minutes for "no data found" results

// Chain ID → GeckoTerminal network slug, derived from the shared chain registry
// so it stays in sync with useTokenLiquidity.
const CHAIN_ID_TO_GECKO_NETWORK = chainProviderSlugMap('geckoterminal')

interface Env {}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainId = url.searchParams.get('chainId')
  const tokenAddress = url.searchParams.get('address')

  if (!chainId)
    return errorResponse('Missing chainId', 400)
  if (!tokenAddress)
    return errorResponse('Missing address', 400)
  if (!/^0x[0-9a-f]{40}$/i.test(tokenAddress))
    return errorResponse('Invalid token address', 400)

  const network = CHAIN_ID_TO_GECKO_NETWORK.get(Number(chainId))
  if (!network)
    return errorResponse(`Unsupported chainId: ${chainId}`, 400)

  const address = tokenAddress.toLowerCase()
  const geckoTokenUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}?include=top_pools`
  const geckoPoolsUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}/pools?page=1`

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: promise => context.waitUntil(promise),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      // Try the token endpoint first (includes top_pools and total_reserve_in_usd)
      let tokenStatus = 0
      try {
        const tokenRes = await fetchWithDeadline(geckoTokenUrl, {
          signal: context.request.signal,
          headers: { accept: 'application/json' },
        })
        tokenStatus = tokenRes.status

        if (tokenRes.ok) {
          const json: any = await tokenRes.json()
          const totalReserve = Number(json?.data?.attributes?.total_reserve_in_usd)
          if (Number.isFinite(totalReserve) && totalReserve > 0) {
            return { data: { liquidityUsd: String(Math.round(totalReserve)) } }
          }

          // Fallback: sum reserve_in_usd from included pools
          const included = (json?.included ?? []) as Array<any>
          const sum = included.reduce((acc: number, item: any) => {
            const value = Number(item?.attributes?.reserve_in_usd ?? 0)
            return acc + (Number.isFinite(value) ? value : 0)
          }, 0)
          if (Number.isFinite(sum) && sum > 0) {
            return { data: { liquidityUsd: String(Math.round(sum)) } }
          }
        }

        // A confirmed missing token is an unavailable resource, unlike transport errors.
        if (tokenStatus === 404) {
          return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
        }
      }
      catch (error) {
        if (context.request.signal.aborted)
          throw error
        // A different public endpoint may still provide a result.
      }

      // Second attempt: pools endpoint
      const poolsRes = await fetchWithDeadline(geckoPoolsUrl, {
        signal: context.request.signal,
        headers: { accept: 'application/json' },
      })

      if (!poolsRes.ok) {
        if (poolsRes.status === 404)
          return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
        throw new Error(`GeckoTerminal upstream error: ${poolsRes.status}`)
      }

      const poolsJson: any = await poolsRes.json()
      const pools = (poolsJson?.data ?? []) as Array<any>
      const total = pools.reduce((acc: number, item: any) => {
        const value = Number(item?.attributes?.reserve_in_usd ?? 0)
        return acc + (Number.isFinite(value) ? value : 0)
      }, 0)

      if (Number.isFinite(total) && total > 0) {
        return { data: { liquidityUsd: String(Math.round(total)) } }
      }

      // GeckoTerminal returned data but no liquidity found — cache null briefly
      return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
    },
  })
}
