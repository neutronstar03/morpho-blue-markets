import type { UserSupplyPosition } from './supply-optimizer'
import type { OptimizerStrategy } from './supply-optimizer-runner'
import { formatUnits } from 'viem'

export function pctFromWad(wad: bigint, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(wad, 18)) * 100
  if (!Number.isFinite(asNum))
    return '—'
  return `${asNum.toFixed(digits)}%`
}

export function fmtToken(amount: bigint, decimals: number, digits = 4): string {
  const asNum = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(asNum))
    return '—'
  return asNum.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function trimTrailingZerosDecimalString(s: string): string {
  // Ensure "3072.0000" -> "3072" and "12.3400" -> "12.34"
  if (!s.includes('.'))
    return s
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed
}

export function buildMoveSizeCacheKey(args: {
  chainId?: number
  loanAssetAddress?: string
  newDepositAssets: bigint
  fallbackAprWad?: bigint
  maxMarketsUsed: number
  positions: UserSupplyPosition[]
  strategy?: OptimizerStrategy
}): string {
  const positionsKey = [...args.positions]
    .sort((a, b) => a.marketId.localeCompare(b.marketId))
    .map(p => `${p.marketId}:${p.suppliedAssets}`)
    .join('|')
  return [
    args.chainId ?? 0,
    (args.loanAssetAddress ?? 'unknown').toLowerCase(),
    args.newDepositAssets.toString(),
    (args.fallbackAprWad ?? 0n).toString(),
    args.maxMarketsUsed.toString(),
    args.strategy ?? 'maxYield',
    positionsKey,
  ].join('::')
}
