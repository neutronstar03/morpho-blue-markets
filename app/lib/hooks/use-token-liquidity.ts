import type { SupportedChainName } from '~/lib/addresses'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'

type GeckoNetworkSlug = 'eth' | 'base' | 'arbitrum' | 'polygon' | 'unichain' | 'hyperevm' | 'katana' | 'optimism'

const GECKOTERMINAL_BASE_URL = 'https://api.geckoterminal.com/api/v2'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

function makeCacheKey(network: GeckoNetworkSlug, tokenAddress: string): string {
  return `gt:liquidity:${network}:${tokenAddress.toLowerCase()}`
}

interface CacheRecord {
  value: string
  ts: number
}

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
      return 'hyperevm'
    case 'Katana':
      return 'katana'
    case 'Optimism':
      return 'optimism'
    default:
      return undefined
  }
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

      const cacheKey = makeCacheKey(network, tokenAddress)
      const cached = readCachedValue(cacheKey, SIX_HOURS_MS)
      if (cached !== undefined)
        return cached

      const address = tokenAddress.toLowerCase()
      const tokenUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}?include=top_pools`
      const res = await fetch(tokenUrl, { headers: { accept: 'application/json' } })
      const tokenStatus = res.status
      if (res.ok) {
        const json: any = await res.json()
        const totalReserve = Number(json?.data?.attributes?.total_reserve_in_usd)
        if (Number.isFinite(totalReserve) && totalReserve > 0)
          return String(Math.round(totalReserve))

        const included = (json?.included ?? []) as Array<any>
        const sum = included.reduce((acc, item) => {
          const value = Number(item?.attributes?.reserve_in_usd ?? 0)
          return acc + (Number.isFinite(value) ? value : 0)
        }, 0)
        if (Number.isFinite(sum) && sum > 0)
          return String(Math.round(sum))
      }

      const poolsUrl = `${GECKOTERMINAL_BASE_URL}/networks/${network}/tokens/${address}/pools?page=1`
      const poolsRes = await fetch(poolsUrl, { headers: { accept: 'application/json' } })
      if (!poolsRes.ok)
        throw new Error(`GeckoTerminal error ${poolsRes.status}`)

      const poolsJson: any = await poolsRes.json()
      const pools = (poolsJson?.data ?? []) as Array<any>
      const total = pools.reduce((acc, item) => {
        const value = Number(item?.attributes?.reserve_in_usd ?? 0)
        return acc + (Number.isFinite(value) ? value : 0)
      }, 0)
      if (Number.isFinite(total) && total > 0)
        return String(Math.round(total))

      if (!res.ok)
        throw new Error(`GeckoTerminal error ${tokenStatus}`)

      throw new Error('Missing GeckoTerminal liquidity')
    },
    enabled,
    staleTime: SIX_HOURS_MS,
    retry: (failureCount, error) => {
      const message = error instanceof Error ? error.message : ''
      const match = /GeckoTerminal error (\d{3})/.exec(message)
      const status = match ? Number(match[1]) : undefined
      if (status != null && status >= 400 && status <= 499 && status !== 429)
        return false
      return failureCount < 2
    },
    retryDelay: attempt => Math.min(30_000, 2_000 * (2 ** attempt)),
    select: (value) => {
      if (network && tokenAddress)
        writeCachedValue(makeCacheKey(network, tokenAddress), value)
      return value
    },
  })
}
