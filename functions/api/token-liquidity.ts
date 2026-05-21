// Edge-cached API endpoint: GET /api/token-liquidity
// Caches GeckoTerminal token liquidity data at the Cloudflare edge (3600s TTL = 1 hour).
// Returns { liquidityUsd: string | null } — null means "no liquidity data found" and is
// cached for a shorter period (300s = 5min) to avoid re-hammering GeckoTerminal.

import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const GECKOTERMINAL_BASE_URL = 'https://api.geckoterminal.com/api/v2'
const CACHE_TTL_SECONDS = 3600 // 1 hour for successful results
const NEGATIVE_CACHE_TTL_SECONDS = 300 // 5 minutes for "no data found" results

// Chain ID → GeckoTerminal network slug (must match useTokenLiquidity's mapping)
const CHAIN_ID_TO_GECKO_NETWORK: Record<number, string> = {
  1: 'eth',
  8453: 'base',
  42161: 'arbitrum',
  137: 'polygon',
  130: 'unichain',
  999: 'hyperevm',
  747474: 'katana',
  10: 'optimism',
  480: 'world-chain',
}

interface Env {}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainId = url.searchParams.get('chainId')
  const tokenAddress = url.searchParams.get('address')

  if (!chainId)
    return errorResponse('Missing chainId', 400)
  if (!tokenAddress)
    return errorResponse('Missing address', 400)

  const network = CHAIN_ID_TO_GECKO_NETWORK[Number(chainId)]
  if (!network)
    return errorResponse(`Unsupported chainId: ${chainId}`, 400)

  const address = tokenAddress.toLowerCase()
  const geckoTokenUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}?include=top_pools`
  const geckoPoolsUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}/pools?page=1`

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      // Try the token endpoint first (includes top_pools and total_reserve_in_usd)
      let tokenStatus = 0
      try {
        const tokenRes = await fetch(geckoTokenUrl, {
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

        // Don't bother with the pools endpoint if token was 4xx
        // (token not found on GeckoTerminal means pools won't help either)
        if (tokenStatus >= 400 && tokenStatus < 500 && tokenStatus !== 429) {
          return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
        }
      }
      catch {
        // Network error fetching token endpoint — try pools as fallback
      }

      // Second attempt: pools endpoint
      try {
        const poolsRes = await fetch(geckoPoolsUrl, {
          headers: { accept: 'application/json' },
        })

        if (!poolsRes.ok) {
          // GeckoTerminal is erroring — cache null for a short period
          return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
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
      }
      catch {
        // Both endpoints failed — cache null briefly
        return { data: { liquidityUsd: null }, negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS }
      }
    },
  })
}
