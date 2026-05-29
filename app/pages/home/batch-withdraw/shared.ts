import type { Address } from 'viem'

export interface LoanAssetOption {
  address: string
  symbol: string
  decimals: number
}

export interface BatchWithdrawChainOption {
  chainId: number
  name: string
}

export interface MarketPlanItem {
  marketId: `0x${string}`
  collateralSymbol: string
  userSupplyShares: bigint
  suppliedAssets: bigint
  marketTotalSupplyAssets: bigint
  marketTotalSupplyShares: bigint
  liquidityAssets: bigint
  liquidityShares: bigint
  maxWithdrawShares: bigint
  maxWithdrawAssets: bigint
  supplyAprWad: bigint
  plannedWithdrawAssets: bigint
  plannedWithdrawShares: bigint
  fullExit: boolean
}

export interface BatchWithdrawPlanState {
  ok: boolean
  error: string | undefined
  items: MarketPlanItem[]
  remaining: bigint
  overWithdrawAssets: bigint
  totalSupplied: bigint
  totalWithdrawable: bigint
}

export interface BatchWithdrawExecutionState {
  bundlerCfg?: {
    bundler3: Address
    generalAdapter1: Address
  }
  morphoAddress?: Address
  isMorphoAuthorized: boolean
  authorizeAvailable: boolean
  multicallError?: string
  executeError?: string
  readOnly?: boolean
  canExecute: boolean
  isWriting: boolean
  isConfirming: boolean
  onAuthorizeAdapter: () => void
  onExecuteBundle: () => void
  requiredSteps?: string[]
}

export function max0(x: bigint): bigint {
  return x > 0n ? x : 0n
}

export function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
