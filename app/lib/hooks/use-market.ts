import type { CuratedMarket, CuratedMarketJSON, FormattedMarket, FrontendMarket } from '../types'
import { useQuery } from '@tanstack/react-query'

// Types are now in app/lib/types.ts

// Hook to fetch curated markets from JSON
export function useCuratedMarkets(limit: number = 20) {
  return useQuery({
    queryKey: ['curated-markets', limit],
    queryFn: async () => {
      const response = await fetch('/curated-markets.json')
      if (!response.ok) {
        throw new Error('Could not fetch curated markets')
      }
      const data = await response.json() as CuratedMarketJSON

      const markets: FrontendMarket[] = (data.markets || [])
        .slice(0, limit)
        .map(formatCuratedMarket)

      return markets
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Utility function to format a curated market into the standard Market type
export function formatCuratedMarket(curatedMarket: CuratedMarket): FrontendMarket {
  return {
    uniqueKey: curatedMarket.id,
    id: curatedMarket.id,
    chainId: curatedMarket.chainId || 1, // Default to mainnet if not specified
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
    metrics: curatedMarket.metrics,
    whitelisted: curatedMarket.whitelisted,
    creationTimestamp: curatedMarket.createdAt,
  }
}

function formatTokenAmount(
  value: string,
  symbol: string,
  decimals?: number | null,
) {
  if (!value || typeof decimals !== 'number') {
    return `0 ${symbol}`
  }
  try {
    const valueBigInt = BigInt(value)
    const divisor = 10n ** BigInt(decimals)
    const integerPart = valueBigInt / divisor
    const remainder = valueBigInt % divisor
    const fractionalPart = (remainder * 100n) / divisor

    const formattedInteger = integerPart.toLocaleString('en-US')
    const formattedFractional = fractionalPart.toString().padStart(2, '0')

    return `${formattedInteger}.${formattedFractional} ${symbol}`
  }
  catch (e) {
    console.error(`Could not format token amount: ${value}`, e)
    return `0 ${symbol}`
  }
}

// Utility function to format market data for display
export function formatMarketData(market: FrontendMarket): FormattedMarket {
  const { metrics } = market

  const totalBorrowFormatted = formatTokenAmount(
    metrics.totalBorrow,
    market.loanAsset.symbol,
    market.loanAsset.decimals,
  )

  const createdAt = new Date(market.creationTimestamp * 1000).toISOString()

  const collateralAsset = market.collateralAsset || {
    address: '0x0',
    symbol: 'N/A',
    name: 'Not Available',
  }

  return {
    id: market.uniqueKey,
    name: `${collateralAsset.symbol}/${market.loanAsset.symbol}`,
    pair: `${collateralAsset.symbol}/${market.loanAsset.symbol}`,
    chainId: market.chainId,
    chainName: getChainName(market.chainId),
    loanAsset: market.loanAsset,
    collateralAsset,
    totalSupplyFormatted: metrics.tvlFormatted,
    totalBorrowFormatted,
    supplyApyFormatted: metrics.supplyApyFormatted,
    borrowApyFormatted: metrics.borrowApyFormatted,
    utilizationFormatted: metrics.utilizationFormatted,
    tvlFormatted: metrics.tvlFormatted,
    lltvPercent: metrics.lltvFormatted,
    lltvRaw: market.lltv,
    oracleAddress: market.oracleAddress,
    irmAddress: market.irmAddress,
    whitelisted: market.whitelisted,
    createdAt,
    creationTimestamp: market.creationTimestamp,
  }
}

// Utility to get human-readable chain name
export function getChainName(chainId?: number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum'
    case 8453:
      return 'Base'
    case 137:
      return 'Polygon'
    case 42161:
      return 'Arbitrum'
    case 999:
      return 'HyperEVM'
    default:
      return chainId ? `Chain ${chainId}` : 'Unknown'
  }
}
