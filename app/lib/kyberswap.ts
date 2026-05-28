const KYBERSWAP_API_BASE = 'https://aggregator-api.kyberswap.com'
const KYBERSWAP_CLIENT_ID = 'mbm'

const KYBERSWAP_CHAIN_SLUGS = new Map<number, string>([
  [1, 'ethereum'],
  [10, 'optimism'],
  [137, 'polygon'],
  [8453, 'base'],
  [42161, 'arbitrum'],
  [130, 'unichain'],
  [999, 'hyperevm'],
  [143, 'monad'],
])

export interface KyberSwapEstimateParams {
  chainId: number
  sellToken: string
  buyToken: string
  sellAmount: string
}

export interface KyberSwapEstimate {
  grossBuyAmount: string
  netBuyAmount: string
  sellAmount: string
  sources: string[]
  zid: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`KyberSwap response missing ${key}`)
  }
  return value
}

function parseKyberSwapEstimate(input: unknown): KyberSwapEstimate {
  if (!isRecord(input) || !isRecord(input.data) || !isRecord(input.data.routeSummary)) {
    throw new Error('Malformed KyberSwap response')
  }

  const routeSummary = input.data.routeSummary
  const sellAmount = requireString(routeSummary, 'amountIn')
  const amountOut = requireString(routeSummary, 'amountOut')
  const routeID = requireString(routeSummary, 'routeID')
  const route = Array.isArray(routeSummary.route) ? routeSummary.route : []
  const sources = Array.from(new Set(route.flatMap((path) => {
    if (!Array.isArray(path)) {
      return []
    }

    return path.flatMap((leg) => {
      if (!isRecord(leg) || typeof leg.exchange !== 'string') {
        return []
      }
      return [leg.exchange]
    })
  })))

  return {
    grossBuyAmount: amountOut,
    netBuyAmount: amountOut,
    sellAmount,
    sources,
    zid: routeID,
  }
}

export function isKyberSwapSupportedChain(chainId: number): boolean {
  return KYBERSWAP_CHAIN_SLUGS.has(chainId)
}

export async function fetchKyberSwapEstimate(params: KyberSwapEstimateParams): Promise<KyberSwapEstimate> {
  const chainSlug = KYBERSWAP_CHAIN_SLUGS.get(params.chainId)
  if (!chainSlug) {
    throw new Error('KyberSwap does not support this chain')
  }

  const url = new URL(`${KYBERSWAP_API_BASE}/${chainSlug}/api/v1/routes`)
  url.searchParams.set('tokenIn', params.sellToken)
  url.searchParams.set('tokenOut', params.buyToken)
  url.searchParams.set('amountIn', params.sellAmount)

  const res = await fetch(url.toString(), {
    headers: {
      'accept': 'application/json',
      'x-client-id': KYBERSWAP_CLIENT_ID,
    },
  })

  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = isRecord(json) && typeof json.message === 'string'
      ? json.message
      : `KyberSwap HTTP ${res.status}`
    throw new Error(message)
  }

  return parseKyberSwapEstimate(json)
}
