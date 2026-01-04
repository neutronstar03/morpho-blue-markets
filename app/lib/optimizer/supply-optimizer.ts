import { formatUnits } from 'viem'
import { adaptiveCurveBorrowRateView } from '../irm/adaptive-curve-irm'

const WAD = 1_000_000_000_000_000_000n
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

export interface SupplyOptimizerMarketSnapshot {
  /** Morpho market id (bytes32 as 0x-hex). On Morpho GraphQL this is `uniqueKey`. */
  marketId: `0x${string}`
  /** Optional human id for logs (e.g. GraphQL uniqueKey). */
  uniqueKey?: string
  /** Onchain totals (raw loan token units). */
  totalSupplyAssets: bigint
  totalBorrowAssets: bigint
  /** Onchain lastUpdate (seconds). */
  lastUpdate: bigint
  /** Morpho fee (WAD, 1e18 = 100%). */
  feeWad: bigint
  /** AdaptiveCurveIRM per-market state: IRM.rateAtTarget(marketId) (int256). */
  rateAtTarget: bigint
}

export interface SupplyOptimizerConstraints {
  /** Maximum number of markets allowed to have a non-zero allocation. */
  maxMarketsUsed?: number
  /** Global per-market cap (raw assets). */
  perMarketCapAssets?: bigint
  /** Optional market-specific cap resolver (raw assets). Overrides `perMarketCapAssets` when provided. */
  perMarketCapAssetsByMarket?: (m: SupplyOptimizerMarketSnapshot) => bigint | undefined
  /**
   * Minimum acceptable supply APY (WAD). Markets whose *post-step* APY is below this are skipped.
   * Example: 0.02e18 = 2% APY.
   */
  minSupplyApyWad?: bigint
}

export interface OptimizeSupplyAllocationArgs {
  markets: SupplyOptimizerMarketSnapshot[]
  /** Total amount to allocate (raw loan token units). */
  totalAmountAssets: bigint
  /** Step size (raw loan token units). */
  stepAssets: bigint
  /**
   * Timestamp (seconds) to use in AdaptiveCurve math.
   * For determinism, pass the pinned block timestamp used for the snapshot.
   */
  timestamp: bigint
  constraints?: SupplyOptimizerConstraints
  /** Hard cap on greedy iterations to avoid accidental O(N*K) blowups. */
  maxIterations?: number
}

export interface OptimizedMarketAllocation {
  marketId: `0x${string}`
  uniqueKey?: string
  amountAssets: bigint
  /** Post-allocation utilization (WAD). */
  utilizationAfterWad: bigint
  /** Post-allocation supply APR (WAD, simple: ratePerSecond * secondsPerYear). */
  supplyAprAfterWad: bigint
  /** Post-allocation supply APY (WAD, compounded: exp(ratePerSecond * secondsPerYear) - 1). */
  supplyApyAfterWad: bigint
}

export interface OptimizeSupplyAllocationResult {
  allocations: OptimizedMarketAllocation[]
  /** Total allocated (should equal requested amount if feasible). */
  totalAllocatedAssets: bigint
  /** Blended APR across all allocations (WAD). */
  blendedAprWad: bigint
  /** Blended APY across all allocations (WAD). */
  blendedApyWad: bigint
  /** Number of greedy iterations performed. */
  iterations: number
  /** If allocation stopped early, this indicates the remaining amount. */
  unallocatedAssets: bigint
}

function clamp0ToWad(x: bigint): bigint {
  if (x < 0n)
    return 0n
  if (x > WAD)
    return WAD
  return x
}

export function utilizationWad(totalBorrowAssets: bigint, totalSupplyAssets: bigint): bigint {
  if (totalSupplyAssets <= 0n)
    return 0n
  if (totalBorrowAssets <= 0n)
    return 0n
  // WAD * borrow / supply, rounded down.
  return (totalBorrowAssets * WAD) / totalSupplyAssets
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
  // Convert WAD to float per-second.
  const r = Number.parseFloat(formatUnits(ratePerSecondWad, 18))
  if (!Number.isFinite(r) || r <= 0)
    return 0n
  const apy = Math.expm1(r * Number(SECONDS_PER_YEAR))
  if (!Number.isFinite(apy) || apy <= 0)
    return 0n
  // Convert to WAD (floor to stay conservative).
  return BigInt(Math.floor(apy * 1e18))
}

export function computeSupplyAfterDeltaWad(args: {
  market: SupplyOptimizerMarketSnapshot
  /** Total delta supply applied (raw loan token units, >= 0). */
  deltaSupplyAssets: bigint
  timestamp: bigint
}): {
  utilizationAfterWad: bigint
  borrowRatePerSecondWad: bigint
  supplyRatePerSecondWad: bigint
  supplyAprWad: bigint
  supplyApyWad: bigint
} {
  const { market, timestamp } = args
  const delta = args.deltaSupplyAssets > 0n ? args.deltaSupplyAssets : 0n
  const nextSupply = market.totalSupplyAssets + delta
  const supplyAfter = nextSupply > 0n ? nextSupply : 0n

  const borrowRatePerSecondWad = adaptiveCurveBorrowRateView({
    marketId: market.marketId,
    rateAtTarget: market.rateAtTarget,
    market: {
      totalSupplyAssets: supplyAfter,
      totalBorrowAssets: market.totalBorrowAssets,
      lastUpdate: market.lastUpdate,
    },
    timestamp,
  })

  const utilAfterWad = utilizationWad(market.totalBorrowAssets, supplyAfter)
  const supplyRateWad = supplyRatePerSecondWad({
    borrowRatePerSecondWad,
    utilizationWad: utilAfterWad,
    feeWad: market.feeWad,
  })

  const supplyAprWad = aprWadFromRatePerSecondWad(supplyRateWad)
  const supplyApyWad = apyWadFromRatePerSecondWad(supplyRateWad)
  return {
    utilizationAfterWad: utilAfterWad,
    borrowRatePerSecondWad,
    supplyRatePerSecondWad: supplyRateWad,
    supplyAprWad,
    supplyApyWad,
  }
}

function minBigint(a: bigint, b: bigint): bigint {
  return a <= b ? a : b
}

function getPerMarketCap(m: SupplyOptimizerMarketSnapshot, c?: SupplyOptimizerConstraints): bigint | undefined {
  const byMarket = c?.perMarketCapAssetsByMarket?.(m)
  if (byMarket != null)
    return byMarket
  return c?.perMarketCapAssets
}

export function optimizeSupplyAllocation(args: OptimizeSupplyAllocationArgs): OptimizeSupplyAllocationResult {
  const {
    markets,
    totalAmountAssets,
    stepAssets,
    timestamp,
    constraints,
    maxIterations = 500,
  } = args

  if (totalAmountAssets <= 0n || markets.length === 0)
    return { allocations: [], totalAllocatedAssets: 0n, blendedAprWad: 0n, blendedApyWad: 0n, iterations: 0, unallocatedAssets: totalAmountAssets }
  if (stepAssets <= 0n)
    throw new Error('stepAssets must be > 0')

  const allocated: bigint[] = Array.from({ length: markets.length }, () => 0n)
  const used = new Set<number>()
  let remaining = totalAmountAssets

  const minApyWad = constraints?.minSupplyApyWad
  const maxMarketsUsed = constraints?.maxMarketsUsed

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestIdx = -1
    let bestStep = 0n
    let bestScore = -1n

    for (let i = 0; i < markets.length; i++) {
      const m = markets[i]

      // Respect maxMarketsUsed: if this market is currently unused, we can only add it if capacity remains.
      if (maxMarketsUsed != null && maxMarketsUsed > 0 && allocated[i] === 0n && used.size >= maxMarketsUsed)
        continue

      const cap = getPerMarketCap(m, constraints)
      const capRemaining = cap != null ? (cap - allocated[i]) : undefined
      if (capRemaining != null && capRemaining <= 0n)
        continue

      let step = minBigint(stepAssets, remaining)
      if (capRemaining != null)
        step = minBigint(step, capRemaining)
      if (step <= 0n)
        continue

      const deltaAfter = allocated[i] + step
      const { supplyApyWad } = computeSupplyAfterDeltaWad({ market: m, deltaSupplyAssets: deltaAfter, timestamp })
      if (minApyWad != null && supplyApyWad < minApyWad)
        continue

      // Score is proportional to expected 1y revenue for this step, up to a constant scale.
      // revenue ~ stepAssets * APY
      const score = step * supplyApyWad // (assets * WAD)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
        bestStep = step
      }
    }

    if (bestIdx < 0 || bestStep <= 0n)
      break

    allocated[bestIdx] += bestStep
    used.add(bestIdx)
    remaining -= bestStep
    iterations++
  }

  const allocations: OptimizedMarketAllocation[] = []
  let weightedAprSum = 0n // assets * WAD
  let weightedApySum = 0n // assets * WAD
  let totalAllocated = 0n

  for (let i = 0; i < markets.length; i++) {
    const amt = allocated[i]
    if (amt <= 0n)
      continue
    const m = markets[i]
    const { supplyAprWad, supplyApyWad, utilizationAfterWad } = computeSupplyAfterDeltaWad({ market: m, deltaSupplyAssets: amt, timestamp })
    allocations.push({
      marketId: m.marketId,
      uniqueKey: m.uniqueKey,
      amountAssets: amt,
      utilizationAfterWad,
      supplyAprAfterWad: supplyAprWad,
      supplyApyAfterWad: supplyApyWad,
    })
    totalAllocated += amt
    weightedAprSum += amt * supplyAprWad
    weightedApySum += amt * supplyApyWad
  }

  // blendedApr = sum(amount*apr)/sum(amount)
  const blendedAprWad = totalAllocated > 0n ? (weightedAprSum / totalAllocated) : 0n
  const blendedApyWad = totalAllocated > 0n ? (weightedApySum / totalAllocated) : 0n

  // Deterministic ordering for logs.
  allocations.sort((a, b) => (a.amountAssets === b.amountAssets ? 0 : (a.amountAssets > b.amountAssets ? -1 : 1)))

  return {
    allocations,
    totalAllocatedAssets: totalAllocated,
    blendedAprWad,
    blendedApyWad,
    iterations,
    unallocatedAssets: remaining,
  }
}
