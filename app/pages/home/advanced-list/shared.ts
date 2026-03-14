import type { SupportedChain } from '~/lib/addresses'

export type Setter<T> = (value: T | ((prev: T) => T)) => void
export type MarketSide = 'supply' | 'borrow'
export type MarketChainFilter = 'ALL' | SupportedChain

export interface MarketData {
  id: string
  marketLabel: string
  chainId: number
  chainName: string
  marketSizeUsd: number | null | undefined
  beforeTarget: string
  utilizationPct: string
  netSupplyApy: number
  netBorrowApy: number
  collateralAddress: string
  loanAddress: string
  oracleAddress?: string
  irmAddress: string
  lltv?: string
  warnings?: Array<{ type: string, level: 'YELLOW' | 'RED' }>
}

export function getMarketSideColors(side: MarketSide) {
  if (side === 'borrow') {
    return {
      background: 'bg-orange-950/50',
      backgroundLight: 'bg-orange-950/30',
      hover: 'hover:bg-orange-900/50',
      border: 'border-orange-800/30',
      rateText: 'text-orange-300',
    }
  }
  return {
    background: 'bg-gray-900/50',
    backgroundLight: 'bg-gray-800',
    hover: 'hover:bg-gray-700/50',
    border: 'border-gray-700',
    rateText: 'text-green-300',
  }
}
