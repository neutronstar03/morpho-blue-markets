import type { FormattedMarket, FrontendMarket } from '../types'
import { useQuery } from '@tanstack/react-query'
import { request } from 'graphql-request'
import { GetMarketDocument } from '../graphql/market'

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql'

export interface Market {
  id: string
  uniqueKey: string
  lltv: string
  oracle: {
    address: string
  }
  irmAddress: string
  creationTimestamp: string
  whitelisted: boolean
  loanAsset: {
    address: string
    symbol: string
    name: string | null
    decimals: number | null
    chain: {
      id: string
    }
  }
  collateralAsset: {
    address: string
    symbol: string
    name: string | null
    decimals: number | null
    chain: {
      id: string
    }
  }
  state: {
    supplyApy: number
    borrowApy: number
    supplyAssets: string
    borrowAssets: string
    utilization: number
    price: string
  }
}

export function useMarketQuery(uniqueKey?: string, chainId?: number) {
  return useQuery({
    queryKey: ['market', uniqueKey, chainId],
    queryFn: async () => {
      if (!uniqueKey || !chainId)
        return null
      const { marketByUniqueKey } = await request(
        MORPHO_API_URL,
        GetMarketDocument,
        {
          uniqueKey,
          chainId,
        },
      )
      return marketByUniqueKey as Market
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Utility function to format a market from GraphQL into the FrontendMarket type
export function formatGqlMarket(market: Market): FrontendMarket {
  return {
    uniqueKey: market.uniqueKey,
    id: market.id,
    chainId: Number(market.loanAsset.chain.id),
    lltv: market.lltv,
    oracleAddress: market.oracle.address,
    irmAddress: market.irmAddress,
    loanAsset: {
      address: market.loanAsset.address,
      symbol: market.loanAsset.symbol,
      name: market.loanAsset.name,
      decimals: market.loanAsset.decimals,
    },
    collateralAsset: {
      address: market.collateralAsset.address,
      symbol: market.collateralAsset.symbol,
      name: market.collateralAsset.name,
      decimals: market.collateralAsset.decimals,
    },
    metrics: {
      supplyApy: market.state.supplyApy,
      borrowApy: market.state.borrowApy,
      totalSupply: market.state.supplyAssets.toString(),
      totalBorrow: market.state.borrowAssets.toString(),
      utilization: market.state.utilization,
      tvl: Number(market.state.supplyAssets),
      supplyApyFormatted: `${(market.state.supplyApy * 100).toFixed(2)}%`,
      borrowApyFormatted: `${(market.state.borrowApy * 100).toFixed(2)}%`,
      tvlFormatted: '',
      utilizationFormatted: `${(market.state.utilization * 100).toFixed(2)}%`,
      lltvFormatted: `${Number(market.lltv) / 1e18}%`,
      isStablecoinPair: false,
    },
    whitelisted: market.whitelisted,
    creationTimestamp: Number(market.creationTimestamp),
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
