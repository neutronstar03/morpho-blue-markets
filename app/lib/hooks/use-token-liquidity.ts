import type { SupportedChainName } from '~/lib/addresses'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'

type GeckoNetworkSlug
  = | 'eth' // Ethereum
    | 'base'
    | 'arbitrum'
    | 'polygon'
    | 'unichain'
    // GeckoTerminal treats "Hyperliquid" (non-EVM) and "HyperEVM" (EVM chain) as distinct networks.
    // Our Morpho deployment is on the EVM chain (chainId 999), which GeckoTerminal calls "hyperevm".
    | 'hyperliquid'
    | 'hyperevm'
    | 'katana'
    | 'optimism'

interface GeckoPoolResource {
  id: string
  type: 'pool'
  attributes: {
    name?: string
    address?: string
    reserve_in_usd?: string | null
  }
}

interface GeckoTokenResource {
  id: string
  type: 'token'
  attributes?: {
    // Total liquidity across pools tracked by GeckoTerminal for this token, in USD.
    // This is the best single value to use when available (vs summing only top pools / first page).
    total_reserve_in_usd?: string | null
  }
  relationships?: {
    top_pools?: {
      data?: Array<{ id: string, type: 'pool' }>
    }
  }
}

interface GeckoTokenResponse {
  data: GeckoTokenResource
  // When requesting `include=top_pools`, GeckoTerminal returns pool resources here.
  included?: GeckoPoolResource[]
}

interface GeckoPoolsResponse {
  data: GeckoPoolResource[]
}

export interface UseTokenLiquidityArgs {
  chainId?: number
  tokenAddress?: string
}

function mapChainToGeckoNetwork(chainId?: number): GeckoNetworkSlug | undefined {
  const chainName = getSupportedChainName(chainId) as SupportedChainName
  switch (chainName) {
    case 'Ethereum':
      return 'eth'
    case 'Base':
      return 'base'
    case 'Arbitrum':
      return 'arbitrum'
    case 'Polygon':
      return 'polygon'
    case 'Unichain':
      return 'unichain'
    case 'Hyperliquid':
      // NOTE: our chain is named "Hyperliquid" in `addresses.ts`, but this is the HyperEVM network.
      return 'hyperevm'
    case 'Katana':
      return 'katana'
    case 'Optimism':
      return 'optimism'
    default:
      return undefined
  }
}

const GECKOTERMINAL_BASE_URL = 'https://api.geckoterminal.com/api/v2'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

function makeCacheKey(network: GeckoNetworkSlug, tokenAddress: string): string {
  return `gt:liquidity:${network}:${tokenAddress.toLowerCase()}`
}

interface CacheRecord { value: string, ts: number }

function readCachedValue(key: string, ttlMs: number): string | undefined {
  try {
    if (typeof window === 'undefined')
      return undefined
    const raw = window.localStorage.getItem(key)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as CacheRecord
    if (!parsed || typeof parsed.value !== 'string' || typeof parsed.ts !== 'number')
      return undefined
    if (Date.now() - parsed.ts > ttlMs) {
      window.localStorage.removeItem(key)
      return undefined
    }
    return parsed.value
  }
  catch {
    return undefined
  }
}

function writeCachedValue(key: string, value: string): void {
  try {
    if (typeof window === 'undefined')
      return
    const record: CacheRecord = { value, ts: Date.now() }
    window.localStorage.setItem(key, JSON.stringify(record))
  }
  catch {
    // ignore quota/security errors
  }
}

async function fetchTopPoolsByToken(network: GeckoNetworkSlug, tokenAddress: string): Promise<GeckoPoolsResponse> {
  const url = new URL(`${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${tokenAddress}/pools`)
  // fixed first page, server sorts by default
  url.searchParams.set('page', '1')

  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  })
  if (!res.ok)
    throw new Error(`GeckoTerminal error ${res.status}`)
  return res.json() as Promise<GeckoPoolsResponse>
}

async function fetchTokenWithTopPools(network: GeckoNetworkSlug, tokenAddress: string): Promise<GeckoTokenResponse> {
  const url = new URL(`${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${tokenAddress}`)
  // Ensure we get pool resources in `included` so we can fall back to summing top pools if needed.
  url.searchParams.set('include', 'top_pools')

  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  })
  if (!res.ok)
    throw new Error(`GeckoTerminal error ${res.status}`)
  return res.json() as Promise<GeckoTokenResponse>
}

function parseUsdToRoundedString(value: string | null | undefined): string | undefined {
  if (!value)
    return undefined
  const n = Number(value)
  if (!Number.isFinite(n))
    return undefined
  return String(Math.round(n))
}

function sumPoolReservesUsd(pools: GeckoPoolResource[] | undefined): string {
  const total = (pools || []).reduce((acc, p) => {
    const v = p.attributes?.reserve_in_usd ? Number(p.attributes.reserve_in_usd) : 0
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0)
  return String(Math.round(total))
}

export function useTokenLiquidity({ chainId, tokenAddress }: UseTokenLiquidityArgs) {
  const network = useMemo(() => mapChainToGeckoNetwork(chainId), [chainId])
  const isClient = typeof window !== 'undefined'
  const enabled = isClient && !!network && !!tokenAddress

  return useQuery<string>({
    queryKey: ['token-liquidity', network, tokenAddress],
    queryFn: async () => {
      if (!network || !tokenAddress)
        throw new Error('Missing network or tokenAddress')

      const key = makeCacheKey(network, tokenAddress)
      const cached = readCachedValue(key, SIX_HOURS_MS)
      if (cached !== undefined)
        return cached

      // Prefer the token endpoint's `total_reserve_in_usd`:
      // - It's a single authoritative liquidity figure computed by GeckoTerminal.
      // - It avoids undercounting (our old approach only summed the first page of pools).
      //
      // If unavailable, fall back to summing pool reserves from `included` (top pools),
      // and finally to summing the first page of `/pools` as a last resort.
      let total: string | undefined
      try {
        const tokenResp = await fetchTokenWithTopPools(network, tokenAddress)
        total = parseUsdToRoundedString(tokenResp.data?.attributes?.total_reserve_in_usd)
        if (!total)
          total = sumPoolReservesUsd(tokenResp.included)
      }
      catch {
        // ignore; we'll fall back to `/pools` below
      }

      if (!total) {
        const poolsResp = await fetchTopPoolsByToken(network, tokenAddress)
        total = sumPoolReservesUsd(poolsResp.data)
      }

      if (!total)
        throw new Error('Failed to compute token liquidity')

      writeCachedValue(key, total)
      return total
    },
    enabled,
    staleTime: SIX_HOURS_MS,
    retry: (failureCount, error) => {
      if (error instanceof Error && /GeckoTerminal error 4\d\d/.test(error.message))
        return false
      return failureCount < 2
    },
  })
}
