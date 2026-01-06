import { formatUnits } from 'viem'

export const WAD = 1_000_000_000_000_000_000n
export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

export function clamp0ToWad(x: bigint): bigint {
  if (x < 0n)
    return 0n
  if (x > WAD)
    return WAD
  return x
}

export function wadDivDown(n: bigint, d: bigint): bigint {
  if (d === 0n)
    return 0n
  return (n * WAD) / d
}

export function utilizationWad(totalBorrowAssets: bigint, totalSupplyAssets: bigint): bigint {
  if (totalSupplyAssets <= 0n)
    return 0n
  if (totalBorrowAssets <= 0n)
    return 0n
  // WAD * borrow / supply, rounded down.
  return (totalBorrowAssets * WAD) / totalSupplyAssets
}

export function apyFromRatePerSecondWad(ratePerSecondWad: bigint): number {
  const r = Number.parseFloat(formatUnits(ratePerSecondWad, 18))
  if (!Number.isFinite(r) || r <= 0)
    return 0
  // Continuous-compounding style APY (stable for small r via expm1).
  return Math.expm1(r * Number(SECONDS_PER_YEAR))
}

export function supplyRatePerSecondWad(args: {
  borrowRatePerSecondWad: bigint
  utilizationWad: bigint
  feeWad: bigint
}): bigint {
  const feeWad = clamp0ToWad(args.feeWad)
  const utilWad = clamp0ToWad(args.utilizationWad)
  // supplyRate = borrowRate * utilization * (1 - fee)
  const afterUtil = (args.borrowRatePerSecondWad * utilWad) / WAD
  return (afterUtil * (WAD - feeWad)) / WAD
}

export function aprWadFromRatePerSecondWad(ratePerSecondWad: bigint): bigint {
  // APR ~= ratePerSecond * secondsPerYear (no compounding).
  return ratePerSecondWad * SECONDS_PER_YEAR
}

export function apyWadFromRatePerSecondWad(ratePerSecondWad: bigint): bigint {
  const apy = apyFromRatePerSecondWad(ratePerSecondWad)
  if (!Number.isFinite(apy) || apy <= 0)
    return 0n
  // Convert to WAD (floor to stay conservative).
  return BigInt(Math.floor(apy * 1e18))
}
