// DEPRECATED: unused 0x-backed swap estimate endpoint.
// KyberSwap browser-side route simulation is now the primary oracle-drift path.
// Keep this dead code in the repo for one release as a rollback reference.
//
// Edge-cached API endpoint: GET /api/swap-estimate
// Proxies a single 0x swap quote for oracle-drift estimation.
//
// Params (all required):
//   chainId      — integer chain ID
//   sellToken    — collateral token address (0x…)
//   buyToken     — loan token address (0x…)
//   sellAmount   — amount to swap in sellToken base units (stringified bigint)
//
// The function does **one** upstream call to 0x v2 and adjusts the returned
// buyAmount by adding back the 0x protocol fee so the price reflects the
// underlying DEX spot (what a public frontend or liquidator would see).
//
// Cache TTL: 300 s (5 min). Cache key uses the exact canonical sellAmount.

import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 300 // 5 minutes
const NEGATIVE_CACHE_TTL_SECONDS = 300 // 5 minutes for "no liquidity"
const ZEROEX_API_VERSION = 'v2'
const ZEROEX_API_BASE = 'https://api.0x.org/swap/allowance-holder/quote'

// 0x does not support Katana (chainId 747474). All other chains listed in wagmi.ts
// (1, 10, 137, 8453, 42161, 480, 130, 999, 143) are supported as of May 2026.
const UNSUPPORTED_CHAIN_IDS = new Set([747474])

interface Env {
  ZEROEX_API_KEY: string
}

function isValidAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v)
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)

  // --- Parse & validate params ------------------------------------------------
  const chainIdRaw = url.searchParams.get('chainId')
  const sellToken = url.searchParams.get('sellToken')
  const buyToken = url.searchParams.get('buyToken')
  const sellAmount = url.searchParams.get('sellAmount')

  if (!chainIdRaw || !sellToken || !buyToken || !sellAmount) {
    return errorResponse(
      'Missing required params: chainId, sellToken, buyToken, sellAmount',
      400,
    )
  }

  const chainId = Number(chainIdRaw)
  if (!Number.isFinite(chainId) || chainId <= 0 || UNSUPPORTED_CHAIN_IDS.has(chainId)) {
    return errorResponse('Unsupported or invalid chainId', 400)
  }

  if (!isValidAddress(sellToken) || !isValidAddress(buyToken)) {
    return errorResponse('Invalid sellToken or buyToken address', 400)
  }

  if (!/^\d+$/.test(sellAmount) || BigInt(sellAmount) <= 0n) {
    return errorResponse('sellAmount must be a positive integer string', 400)
  }

  // Build a canonical cache key from the exact 0x quote identity.
  // The frontend canonicalizes sellAmount before calling this endpoint, so
  // normal HTTP cache semantics remain correct while still getting cache hits.
  const cacheUrl = new URL(context.request.url)
  cacheUrl.search = ''
  cacheUrl.searchParams.set('chainId', String(chainId))
  cacheUrl.searchParams.set('sellToken', sellToken.toLowerCase())
  cacheUrl.searchParams.set('buyToken', buyToken.toLowerCase())
  cacheUrl.searchParams.set('sellAmount', sellAmount)
  const cacheKey = cacheUrl.toString()

  // --- Edge-cache proxy ---------------------------------------------------------
  return edgeCacheProxy({
    requestUrl: cacheKey,
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const taker = '0x0000000000000000000000000000000000012345'

      const zeroExUrl = new URL(ZEROEX_API_BASE)
      zeroExUrl.searchParams.set('chainId', String(chainId))
      zeroExUrl.searchParams.set('sellToken', sellToken)
      zeroExUrl.searchParams.set('buyToken', buyToken)
      zeroExUrl.searchParams.set('sellAmount', sellAmount)
      zeroExUrl.searchParams.set('taker', taker)

      const apiKey = context.env.ZEROEX_API_KEY
      if (!apiKey) {
        throw new Error('ZEROEX_API_KEY is not configured')
      }

      const res = await fetch(zeroExUrl.toString(), {
        headers: {
          '0x-api-key': apiKey,
          '0x-version': ZEROEX_API_VERSION,
        },
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`0x API error ${res.status}: ${text}`)
      }

      const quote = (await res.json()) as Record<string, unknown>

      // 0x returns { liquidityAvailable: false, … } when no route exists.
      if (quote.liquidityAvailable === false && !quote.buyAmount) {
        return {
          data: { error: 'No liquidity available for this swap' },
          negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS,
        }
      }

      const netBuyAmountStr = String(quote.buyAmount ?? '0')
      const zeroExFee = (quote.fees as Record<string, unknown> | undefined)?.zeroExFee as
        | { amount?: string }
        | undefined
      const zeroExFeeStr = String(zeroExFee?.amount ?? '0')

      // Gross buy amount = what the underlying DEX pools actually give,
      // before 0x deducts its protocol fee.
      const netBuyAmount = BigInt(netBuyAmountStr)
      const feeAmount = BigInt(zeroExFeeStr)
      const grossBuyAmount = netBuyAmount + feeAmount

      // Collect liquidity sources if available (0x sometimes returns them top-level)
      const sources = Array.isArray(quote.sources)
        ? quote.sources.filter((s): s is string => typeof s === 'string')
        : []

      return {
        data: {
          grossBuyAmount: grossBuyAmount.toString(),
          netBuyAmount: netBuyAmount.toString(),
          sellAmount,
          sources,
          zid: String(quote.zid ?? ''),
        },
      }
    },
  })
}
