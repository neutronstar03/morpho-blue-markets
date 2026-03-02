import type { SupportedChainName } from '~/lib/addresses'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'

type GeckoNetworkSlug = 'eth' | 'base' | 'arbitrum' | 'polygon' | 'unichain' | 'hyperevm' | 'katana' | 'optimism'

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

      const address = tokenAddress.toLowerCase()
      const base = 'https://api.geckoterminal.com/api/v2'
      const tokenUrl = `${base}/networks/${network}/tokens/${address}?include=top_pools`
      const res = await fetch(tokenUrl, { headers: { accept: 'application/json' } })
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

      const poolsUrl = `${base}/networks/${network}/tokens/${address}/pools?page=1`
      const poolsRes = await fetch(poolsUrl, { headers: { accept: 'application/json' } })
      if (!poolsRes.ok)
        throw new Error(`GeckoTerminal error (${poolsRes.status})`)

      const poolsJson: any = await poolsRes.json()
      const pools = (poolsJson?.data ?? []) as Array<any>
      const total = pools.reduce((acc, item) => {
        const value = Number(item?.attributes?.reserve_in_usd ?? 0)
        return acc + (Number.isFinite(value) ? value : 0)
      }, 0)
      if (Number.isFinite(total) && total > 0)
        return String(Math.round(total))

      throw new Error('Missing GeckoTerminal liquidity')
    },
    enabled,
    staleTime: 60 * 1000,
    retry: failureCount => failureCount < 3,
    retryDelay: attempt => Math.min(30_000, 2_000 * (2 ** attempt)),
  })
}
