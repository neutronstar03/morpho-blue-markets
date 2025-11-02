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
    | 'hyperliquid'
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

interface GeckoPoolResponse {
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
      return 'hyperliquid'
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

async function fetchTopPoolsByToken(network: GeckoNetworkSlug, tokenAddress: string): Promise<GeckoPoolResponse> {
  const url = new URL(`${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${tokenAddress}/pools`)
  // fixed first page, server sorts by default
  url.searchParams.set('page', '1')

  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  })
  if (!res.ok)
    throw new Error(`GeckoTerminal error ${res.status}`)
  return res.json() as Promise<GeckoPoolResponse>
}

function sumLiquidityUsd(resp: GeckoPoolResponse): string {
  const total = (resp?.data || []).reduce((acc, p) => {
    const v = p.attributes?.reserve_in_usd ? Number(p.attributes.reserve_in_usd) : 0
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0)
  // return as string, rounded to nearest whole USD
  return String(Math.round(total))
}

export function useTokenLiquidity({ chainId, tokenAddress }: UseTokenLiquidityArgs) {
  const network = useMemo(() => mapChainToGeckoNetwork(chainId), [chainId])
  const isClient = typeof window !== 'undefined'
  const enabled = isClient && !!network && !!tokenAddress

  return useQuery<string>({
    queryKey: ['token-liquidity', network, tokenAddress],
    queryFn: async () => {
      const key = makeCacheKey(network as GeckoNetworkSlug, tokenAddress as string)
      const cached = readCachedValue(key, SIX_HOURS_MS)
      if (cached !== undefined)
        return cached

      const raw = await fetchTopPoolsByToken(network as GeckoNetworkSlug, tokenAddress as string)
      const total = sumLiquidityUsd(raw)
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
