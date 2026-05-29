import type { ChainIconComponent } from '~/lib/chain-icons'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'

export interface Portfolio {
  dailyUsd: number | undefined
  yearlyUsd: number | undefined
  weightedAprPct: number | undefined
  totalAssets: bigint | undefined
  totalAssetsUsd: number | undefined
  totalAssetsSymbol: string | undefined
  totalAssetsDecimals: number | undefined
}

export interface PositionGroup {
  key: string
  loanAssetSymbol: string
  loanAssetAddress: string
  totalValueUsd: number
  yearlyUsd: number
  positions: LiveMarketPosition[]
  totalAssets?: bigint
  totalAssetsSymbol?: string
  totalAssetsDecimals?: number
}

export interface ChainPositionPillItem {
  chainId: number
  label: string
  count: number
  Icon?: ChainIconComponent
}
