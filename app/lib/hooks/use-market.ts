import { useQuery } from '@tanstack/react-query'
import { executeQuery, CHAIN_IDS } from '../graphql/client'
import { GET_MARKET_BY_ID, GET_MARKETS, GET_MARKETS_BY_CHAIN } from '../graphql/queries'
import type { Network } from '../graphql/client'

// Types for market data matching the official Morpho Blue API
export interface Market {
  uniqueKey: string
  chainId: number
  lltv: string
  oracleAddress: string
  irmAddress: string
  loanAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  collateralAsset: {
    address: string
    symbol: string
    name?: string | null
    decimals?: number | null
  }
  state: {
    supplyAssets: string
    borrowAssets: string
    supplyApy: number
    borrowApy: number
    utilization: number
    supplyAssetsUsd?: number | null
    borrowAssetsUsd?: number | null
  }
  whitelisted: boolean
  creationTimestamp: number
}

export interface MarketStats {
  uniqueKey: string
  state: {
    supplyAssets: string
    borrowAssets: string
    supplyApy: number
    borrowApy: number
    utilization: number
    supplyAssetsUsd?: number | null
    borrowAssetsUsd?: number | null
  }
}

// Hook to fetch a specific market by uniqueKey
// First checks curated markets JSON, then falls back to API
export function useMarket(marketId: string | undefined, network?: Network) {
  return useQuery({
    queryKey: ['market', marketId, network],
    queryFn: async () => {
      if (!marketId) throw new Error('Market ID is required')

      // Try loading from curated markets first
      try {
        const response = await fetch('/curated-markets.json')
        if (response.ok) {
          const data = await response.json()
          const curatedMarket = data.markets?.find((m: any) => 
            m.id.toLowerCase() === marketId.toLowerCase()
          )
          
          if (curatedMarket) {
            // Convert curated market format to API format
            const market: Market = {
              uniqueKey: curatedMarket.id,
              chainId: 8453, // Base (curated markets are Base only)
              lltv: curatedMarket.lltv,
              oracleAddress: curatedMarket.oracleAddress,
              irmAddress: curatedMarket.irmAddress,
              loanAsset: {
                address: curatedMarket.loanToken.address,
                symbol: curatedMarket.loanToken.symbol,
                name: curatedMarket.loanToken.name,
                decimals: curatedMarket.loanToken.decimals,
              },
              collateralAsset: {
                address: curatedMarket.collateralToken.address,
                symbol: curatedMarket.collateralToken.symbol,
                name: curatedMarket.collateralToken.name,
                decimals: curatedMarket.collateralToken.decimals,
              },
              state: {
                supplyAssets: curatedMarket.metrics.tvl.toString(),
                borrowAssets: '0', // Not in curated format
                supplyApy: curatedMarket.metrics.supplyApy,
                borrowApy: curatedMarket.metrics.borrowApy,
                utilization: curatedMarket.metrics.utilization,
                supplyAssetsUsd: curatedMarket.metrics.tvl,
                borrowAssetsUsd: null,
              },
              whitelisted: curatedMarket.whitelisted,
              creationTimestamp: curatedMarket.createdAt,
            }
            
            if (network) {
              const targetChainId = CHAIN_IDS[network]
              if (market.chainId !== targetChainId) {
                throw new Error(`Market found on ${getChainName(market.chainId)}. Switch network to continue.`)
              }
            }
            
            return market
          }
        }
      } catch (e) {
        console.warn('Could not load from curated markets:', e)
      }

      // Fallback: fetch all markets and filter client-side (API doesn't support uniqueKey filter)
      const data = await executeQuery<{ markets: { items: Market[] } }>(
        GET_MARKETS,
        { first: 1000 }
      )

      const market = data.markets.items?.find(m => 
        m.uniqueKey.toLowerCase() === marketId.toLowerCase()
      )
      
      if (!market) {
        throw new Error('Market not found')
      }

      if (network) {
        const targetChainId = CHAIN_IDS[network]
        if (market.chainId !== targetChainId) {
          throw new Error(`Market found on ${getChainName(market.chainId)}. Switch network to continue.`)
        }
      }

      return market
    },
    enabled: !!marketId,
    staleTime: 30 * 1000, // 30 seconds
  })
}

// Hook to fetch markets (network filtering via client-side filter for now)
export function useMarkets(network?: Network, limit: number = 100) {
  return useQuery({
    queryKey: ['markets', network, limit],
    queryFn: async () => {
      const data = await executeQuery<{ markets: { items: Market[] } }>(
        GET_MARKETS,
        { first: limit }
      )

      // Client-side filtering by network if specified
      if (network) {
        const chainId = CHAIN_IDS[network]
        return data.markets.items.filter((m) => m.chainId === chainId)
      }

      return data.markets.items
    },
    staleTime: 60 * 1000, // 1 minute
  })
}

// Hook to fetch market statistics (same as useMarket for now)
export function useMarketStats(marketId: string | undefined, network?: Network) {
  return useMarket(marketId, network)
}

// Utility to format USD values for display
function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100000 ? 0 : 2,
  }).format(value)
}

function formatTokenAmount(value: string, symbol: string) {
  if (!value) return `0 ${symbol}`
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return `${numeric.toLocaleString()} ${symbol}`
  }
  return `${value} ${symbol}`
}

// Utility function to format market data for display
export function formatMarketData(market: Market) {
  const supplyUsd = market.state.supplyAssetsUsd ?? null
  const borrowUsd = market.state.borrowAssetsUsd ?? null

  const totalSupplyFormatted = supplyUsd !== null
    ? formatUsd(supplyUsd)
    : formatTokenAmount(market.state.supplyAssets, market.loanAsset.symbol)

  const totalBorrowFormatted = borrowUsd !== null
    ? formatUsd(borrowUsd)
    : formatTokenAmount(market.state.borrowAssets, market.loanAsset.symbol)

  const utilizationFormatted = `${(market.state.utilization * 100).toFixed(2)}%`
  const supplyApyFormatted = `${(market.state.supplyApy * 100).toFixed(2)}%`
  const borrowApyFormatted = `${(market.state.borrowApy * 100).toFixed(2)}%`

  const lltvPercentNumber = Number(market.lltv) / 1e16
  const lltvPercent = Number.isFinite(lltvPercentNumber)
    ? `${lltvPercentNumber.toFixed(2)}%`
    : '—'

  const tvlFormatted = supplyUsd !== null ? formatUsd(supplyUsd) : totalSupplyFormatted

  const createdAt = new Date(market.creationTimestamp * 1000).toISOString()

  return {
    id: market.uniqueKey,
    name: `${market.loanAsset.symbol}/${market.collateralAsset.symbol}`,
    pair: `${market.loanAsset.symbol}/${market.collateralAsset.symbol}`,
    chainId: market.chainId,
    chainName: getChainName(market.chainId),
    loanAsset: market.loanAsset,
    collateralAsset: market.collateralAsset,
    totalSupplyFormatted,
    totalBorrowFormatted,
    supplyApyFormatted,
    borrowApyFormatted,
    utilizationFormatted,
    tvlFormatted,
    lltvPercent,
    lltvRaw: market.lltv,
    oracleAddress: market.oracleAddress,
    irmAddress: market.irmAddress,
    whitelisted: market.whitelisted,
    createdAt,
    creationTimestamp: market.creationTimestamp,
  }
}

export type FormattedMarket = ReturnType<typeof formatMarketData>

// Utility to get human-readable chain name
export function getChainName(chainId?: number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum'
    case 8453:
      return 'Base'
    default:
      return chainId ? `Chain ${chainId}` : 'Unknown'
  }
}
