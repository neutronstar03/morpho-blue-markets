import { adaptiveCurveBorrowRateView } from '../irm/adaptive-curve-irm'
import { aprWadFromRatePerSecondWad, apyWadFromRatePerSecondWad, supplyRatePerSecondWad, utilizationWad } from '../irm/apy-math'
import { addDepositProRata, getPerMarketCap, max0, minBigint, normalizeId, sumBigints } from './supply-optimizer-utils'

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

export interface UserSupplyPosition {
  /** Morpho market id (bytes32 as 0x-hex). */
  marketId: `0x${string}`
  /** User supplied assets in this market (raw loan token units). */
  suppliedAssets: bigint
}

export interface SupplyOptimizerConstraints {
  /** Maximum number of markets allowed to have a non-zero allocation. */
  maxMarketsUsed?: number
  /** Global per-market cap (raw assets). */
  perMarketCapAssets?: bigint
  /** Optional market-specific cap resolver (raw assets). Overrides `perMarketCapAssets` when provided. */
  perMarketCapAssetsByMarket?: (m: SupplyOptimizerMarketSnapshot) => bigint | undefined
  /**
   * Minimum acceptable supply APR (WAD). Markets whose *post-step* APR is below this are skipped.
   * Example: 0.02e18 = 2% APR.
   */
  minSupplyAprWad?: bigint
  /**
   * Minimum annualized benefit (assets * WAD) required to open a new market.
   * Example: targetTotalAssets * 0.001e18 for a 10 bps threshold.
   */
  minNewMarketBenefitWad?: bigint
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

export interface OptimizeSupplyWithPositionsArgs {
  markets: SupplyOptimizerMarketSnapshot[]
  /** Current user supplied assets per market (raw loan token units). Can be empty. */
  positions: UserSupplyPosition[]
  /** New deposit amount to add on top of existing positions (raw loan token units, can be 0 or negative). */
  newDepositAssets: bigint
  /** Step size (raw loan token units). */
  stepAssets: bigint
  /** Timestamp (seconds) used for AdaptiveCurve math. */
  timestamp: bigint
  constraints?: SupplyOptimizerConstraints
  /** If false, disallow withdrawing from existing positions (only add newDeposit). Default: true. */
  allowRebalance?: boolean
  /** Hard cap on greedy iterations. */
  maxIterations?: number
}

export interface OptimizedPositionDelta extends OptimizedMarketAllocation {
  /** Current user supplied assets (raw). */
  currentUserAssets: bigint
  /** Delta to reach the optimized final amount (raw). Positive = supply, negative = withdraw. */
  deltaAssets: bigint
  /** Maximum withdrawable right now due to market liquidity (raw). */
  maxWithdrawAssets: bigint
  /** Minimum final allocation enforced by liquidity/policy (raw). */
  minFinalAssets: bigint
}

export interface OptimizeSupplyWithPositionsResult {
  /** Current (pre-deposit, pre-rebalance) blended APR/APY for the user’s existing position. */
  current: { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint }
  /**
   * Current allocation evaluated at the target total, by adding `newDepositAssets` pro‑rata
   * across existing positions (i.e. "keep weights, just scale up").
   *
   * This is useful for an apples-to-apples comparison against `baselineNoRebalance` / `optimized`,
   * because it uses the same totalAssets as those scenarios.
   */
  currentAtTargetProRata?: { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint }
  /**
   * Baseline after applying `newDepositAssets` without withdrawing/rebalancing existing positions.
   * (This is the “do nothing / just add deposit” reference.)
   */
  baselineNoRebalance?: { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint }
  /** Optimized blended APR/APY for the final portfolio (existing + new deposit). */
  optimized: { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint }
  /** Final per-market targets plus deltas. Includes markets with non-zero current or final. */
  positions: OptimizedPositionDelta[]
  /** Greedy iterations used. */
  iterations: number
  /** If not all of `newDepositAssets` could be allocated (constraints), leftover amount (raw). */
  unallocatedNewDepositAssets: bigint
  /**
   * If the requested target total is infeasible because you cannot withdraw enough liquidity,
   * this is the excess amount that cannot be withdrawn (i.e. minFinalSum - targetTotal).
   */
  infeasibleWithdrawAssets: bigint
}

// NOTE: utilization/supplyRate/apr/apy helpers are shared in `../irm/apy-math`.

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

function blendedRatesFromFinalAllocations(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  finalUserAllocations: readonly bigint[]
  exUserSupplyAssets: readonly bigint[]
  timestamp: bigint
}): { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint } {
  const { markets, finalUserAllocations, exUserSupplyAssets, timestamp } = args
  let total = 0n
  let wApr = 0n
  let wApy = 0n
  for (let i = 0; i < markets.length; i++) {
    const amt = finalUserAllocations[i]
    if (amt <= 0n)
      continue
    const modeledMarket: SupplyOptimizerMarketSnapshot = {
      ...markets[i],
      totalSupplyAssets: exUserSupplyAssets[i] + amt,
    }
    const { supplyAprWad, supplyApyWad } = computeSupplyAfterDeltaWad({
      market: modeledMarket,
      deltaSupplyAssets: 0n,
      timestamp,
    })
    total += amt
    wApr += amt * supplyAprWad
    wApy += amt * supplyApyWad
  }
  return {
    totalAssets: total,
    blendedAprWad: total > 0n ? (wApr / total) : 0n,
    blendedApyWad: total > 0n ? (wApy / total) : 0n,
  }
}

function greedyAllocateUpwards(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  exUserSupplyAssets: readonly bigint[]
  allocations: bigint[]
  remaining: bigint
  stepAssets: bigint
  maxFinal: readonly bigint[]
  timestamp: bigint
  constraints?: SupplyOptimizerConstraints
  used: Set<number>
  maxIterations: number
}): { remaining: bigint, iterations: number } {
  const {
    markets,
    exUserSupplyAssets,
    allocations,
    remaining: remainingIn,
    stepAssets,
    maxFinal,
    timestamp,
    constraints,
    used,
    maxIterations,
  } = args

  if (stepAssets <= 0n)
    throw new Error('stepAssets must be > 0')

  let remaining = remainingIn
  const minAprWad = constraints?.minSupplyAprWad
  const minNewMarketBenefitWad = constraints?.minNewMarketBenefitWad
  const maxMarketsUsed = constraints?.maxMarketsUsed

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestIdx = -1
    let bestStep = 0n
    // Allow negative marginal scores: still pick the least-bad market so we don't stop early
    // and implicitly "leave funds unallocated" under constraints like maxMarketsUsed.
    let bestScore = -(2n ** 255n)

    for (let i = 0; i < markets.length; i++) {
      if (maxMarketsUsed != null && maxMarketsUsed > 0 && allocations[i] === 0n && used.size >= maxMarketsUsed)
        continue

      const capRemaining = maxFinal[i] - allocations[i]
      if (capRemaining <= 0n)
        continue

      let step = minBigint(stepAssets, remaining)
      step = minBigint(step, capRemaining)
      if (step <= 0n)
        continue

      const currentFinal = allocations[i]
      const candidateFinal = allocations[i] + step

      const currentMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupplyAssets[i] + currentFinal,
      }
      const modeledMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupplyAssets[i] + candidateFinal,
      }

      const { supplyAprWad: supplyAprCurrentWad } = computeSupplyAfterDeltaWad({
        market: currentMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      const { supplyAprWad } = computeSupplyAfterDeltaWad({
        market: modeledMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      if (minAprWad != null && supplyAprWad < minAprWad)
        continue

      // Score by *delta* expected 1y yield (assets * WAD), accounting for the APR shift on existing
      // allocated assets when utilization changes. This reduces step-size sensitivity vs step*APR.
      const score = (candidateFinal * supplyAprWad) - (currentFinal * supplyAprCurrentWad)
      if (minNewMarketBenefitWad != null && currentFinal === 0n && score < minNewMarketBenefitWad)
        continue
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
        bestStep = step
      }
    }

    if (bestIdx < 0 || bestStep <= 0n)
      break

    allocations[bestIdx] += bestStep
    if (allocations[bestIdx] > 0n)
      used.add(bestIdx)
    remaining -= bestStep
    iterations++
  }

  return { remaining, iterations }
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

  const minAprWad = constraints?.minSupplyAprWad
  const minNewMarketBenefitWad = constraints?.minNewMarketBenefitWad
  const maxMarketsUsed = constraints?.maxMarketsUsed

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestIdx = -1
    let bestStep = 0n
    // Allow negative marginal scores: still pick the least-bad market so we don't stop early
    // and implicitly "leave funds unallocated" under constraints like maxMarketsUsed.
    let bestScore = -(2n ** 255n)

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

      const currentAmt = allocated[i]
      const candidateAmt = allocated[i] + step

      const { supplyAprWad: supplyAprCurrentWad } = computeSupplyAfterDeltaWad({ market: m, deltaSupplyAssets: currentAmt, timestamp })
      const { supplyAprWad } = computeSupplyAfterDeltaWad({ market: m, deltaSupplyAssets: candidateAmt, timestamp })
      if (minAprWad != null && supplyAprWad < minAprWad)
        continue

      // Score by *delta* expected 1y yield (assets * WAD), accounting for APR shift on already-allocated assets.
      const score = (candidateAmt * supplyAprWad) - (currentAmt * supplyAprCurrentWad)
      if (minNewMarketBenefitWad != null && currentAmt === 0n && score < minNewMarketBenefitWad)
        continue
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

/**
 * Position-aware optimizer that rebalances (optionally) and respects withdrawal liquidity constraints.
 *
 * Optimizes over the user's *final* per-market supplied assets `x_i`, subject to:
 * - sum(x_i) = sum(currentUserAssets) + newDepositAssets
 * - liquidity-limited withdrawals: x_i >= currentUserAssets - marketLiquidity
 *
 * Where marketLiquidity ~= max(0, totalSupplyAssets - totalBorrowAssets) at the pinned block.
 *
 * To avoid double-counting the user inside `market.totalSupplyAssets`, utilization is modeled using:
 *   totalSupplyAssets_modeled = max(0, totalSupplyAssets - currentUserAssets) + x_i
 */
export function optimizeSupplyAllocationWithPositions(args: OptimizeSupplyWithPositionsArgs): OptimizeSupplyWithPositionsResult {
  const {
    markets,
    positions,
    newDepositAssets,
    stepAssets,
    timestamp,
    constraints,
    allowRebalance = true,
    maxIterations = 500,
  } = args

  if (stepAssets <= 0n)
    throw new Error('stepAssets must be > 0')

  const n = markets.length
  if (n === 0) {
    return {
      current: { totalAssets: 0n, blendedAprWad: 0n, blendedApyWad: 0n },
      baselineNoRebalance: undefined,
      optimized: { totalAssets: newDepositAssets > 0n ? newDepositAssets : 0n, blendedAprWad: 0n, blendedApyWad: 0n },
      positions: [],
      iterations: 0,
      unallocatedNewDepositAssets: newDepositAssets > 0n ? newDepositAssets : 0n,
      infeasibleWithdrawAssets: 0n,
    }
  }

  // Map current user assets per market id.
  const userById = new Map<string, bigint>()
  for (const p of positions) {
    const key = normalizeId(p.marketId)
    const prev = userById.get(key) ?? 0n
    const amt = p.suppliedAssets > 0n ? p.suppliedAssets : 0n
    userById.set(key, prev + amt)
  }

  // Ensure market snapshots include any market the user is positioned in.
  const snapshotIds = new Set(markets.map(m => normalizeId(m.marketId)))
  for (const id of userById.keys()) {
    if (!snapshotIds.has(id))
      throw new Error(`Missing market snapshot for user position: ${id}`)
  }

  const currentUser: bigint[] = Array.from({ length: n }, () => 0n)
  const exUserSupply: bigint[] = Array.from({ length: n }, () => 0n)
  const maxWithdraw: bigint[] = Array.from({ length: n }, () => 0n)
  const minFinal: bigint[] = Array.from({ length: n }, () => 0n)
  const maxFinal: bigint[] = Array.from({ length: n }, () => 0n)

  for (let i = 0; i < n; i++) {
    const m = markets[i]
    const u = userById.get(normalizeId(m.marketId)) ?? 0n
    currentUser[i] = u

    // Liquidity available for withdrawals at this snapshot: supply - borrow (floored at 0).
    const liquidity = m.totalSupplyAssets > m.totalBorrowAssets ? (m.totalSupplyAssets - m.totalBorrowAssets) : 0n
    maxWithdraw[i] = minBigint(u, liquidity)

    // Minimum final allocation enforced by liquidity and (optional) no-rebalance policy.
    const minByLiquidity = u - maxWithdraw[i] // cannot withdraw more than maxWithdraw
    const minByPolicy = allowRebalance ? 0n : u
    minFinal[i] = minByLiquidity > minByPolicy ? minByLiquidity : minByPolicy

    // Ex-user supply baseline (avoid double-counting the user in totalSupplyAssets).
    exUserSupply[i] = max0(m.totalSupplyAssets - u)

    const cap = getPerMarketCap(m, constraints)
    maxFinal[i] = cap != null ? cap : (2n ** 255n) // large sentinel

    if (minFinal[i] > maxFinal[i])
      throw new Error(`Infeasible: minFinal > maxFinal for market ${m.marketId}`)
  }

  const currentTotal = sumBigints(currentUser)
  const targetTotal = currentTotal + newDepositAssets

  // Seed with minimums and allocate remaining.
  const finalAlloc = [...minFinal]
  const minSum = sumBigints(minFinal)

  let infeasibleWithdrawAssets = 0n
  let remaining = targetTotal - minSum
  if (remaining < 0n) {
    // Cannot reach targetTotal because we cannot withdraw enough liquidity.
    infeasibleWithdrawAssets = -remaining
    remaining = 0n
  }

  const used = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (finalAlloc[i] > 0n)
      used.add(i)
  }

  const minAprWad = constraints?.minSupplyAprWad
  const minNewMarketBenefitWad = constraints?.minNewMarketBenefitWad
  const maxMarketsUsed = constraints?.maxMarketsUsed

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestIdx = -1
    let bestStep = 0n
    // Allow negative marginal scores: still pick the least-bad market so we don't stop early
    // and implicitly "leave funds unallocated" under constraints like maxMarketsUsed.
    let bestScore = -(2n ** 255n)

    for (let i = 0; i < n; i++) {
      if (maxMarketsUsed != null && maxMarketsUsed > 0 && finalAlloc[i] === 0n && used.size >= maxMarketsUsed)
        continue

      const capRemaining = maxFinal[i] - finalAlloc[i]
      if (capRemaining <= 0n)
        continue

      let step = minBigint(stepAssets, remaining)
      step = minBigint(step, capRemaining)
      if (step <= 0n)
        continue

      const currentFinal = finalAlloc[i]
      const candidateFinal = finalAlloc[i] + step

      const currentMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupply[i] + currentFinal,
      }
      const modeledMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupply[i] + candidateFinal,
      }

      const { supplyAprWad: supplyAprCurrentWad } = computeSupplyAfterDeltaWad({
        market: currentMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      const { supplyAprWad } = computeSupplyAfterDeltaWad({
        market: modeledMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      if (minAprWad != null && supplyAprWad < minAprWad)
        continue

      // Score by *delta* expected 1y yield (assets * WAD), accounting for the APR shift on existing
      // allocated assets when utilization changes.
      const score = (candidateFinal * supplyAprWad) - (currentFinal * supplyAprCurrentWad)
      if (minNewMarketBenefitWad != null && currentFinal === 0n && score < minNewMarketBenefitWad)
        continue
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
        bestStep = step
      }
    }

    if (bestIdx < 0 || bestStep <= 0n)
      break

    finalAlloc[bestIdx] += bestStep
    if (finalAlloc[bestIdx] > 0n)
      used.add(bestIdx)
    remaining -= bestStep
    iterations++
  }

  const currentRates = blendedRatesFromFinalAllocations({
    markets,
    finalUserAllocations: currentUser,
    exUserSupplyAssets: exUserSupply,
    timestamp,
  })

  const currentAtTargetProRata = (newDepositAssets > 0n && currentTotal > 0n)
    ? blendedRatesFromFinalAllocations({
        markets,
        finalUserAllocations: addDepositProRata(currentUser, newDepositAssets),
        exUserSupplyAssets: exUserSupply,
        timestamp,
      })
    : undefined

  // Baseline: keep existing allocations, only add new deposit (no withdraw).
  let baselineNoRebalance: OptimizeSupplyWithPositionsResult['baselineNoRebalance']
  let baselineAllocForFallback: bigint[] | undefined
  let baselineRatesForFallback: { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint } | undefined
  if (newDepositAssets > 0n) {
    const baselineAlloc = [...currentUser]
    const usedBaseline = new Set<number>()
    for (let i = 0; i < n; i++) {
      if (baselineAlloc[i] > 0n)
        usedBaseline.add(i)
    }
    // For baseline, the minFinal is currentUser; allocate deposit upwards.
    const { remaining: baselineRemaining } = greedyAllocateUpwards({
      markets,
      exUserSupplyAssets: exUserSupply,
      allocations: baselineAlloc,
      remaining: newDepositAssets,
      stepAssets,
      maxFinal,
      timestamp,
      constraints,
      used: usedBaseline,
      maxIterations,
    })
    const baselineRates = blendedRatesFromFinalAllocations({
      markets,
      finalUserAllocations: baselineAlloc,
      exUserSupplyAssets: exUserSupply,
      timestamp,
    })
    baselineAllocForFallback = baselineAlloc
    baselineRatesForFallback = baselineRates
    baselineNoRebalance = {
      totalAssets: currentTotal + (newDepositAssets - baselineRemaining),
      blendedAprWad: baselineRates.blendedAprWad,
      blendedApyWad: baselineRates.blendedApyWad,
    }
  }

  // Prefer not to rebalance into a strictly worse outcome when no new capital is added.
  // (Current allocation is always feasible under the liquidity constraint model.)
  let optimizedFinalAlloc = finalAlloc
  let optimizedRates = blendedRatesFromFinalAllocations({
    markets,
    finalUserAllocations: optimizedFinalAlloc,
    exUserSupplyAssets: exUserSupply,
    timestamp,
  })
  if (newDepositAssets === 0n && optimizedRates.blendedAprWad < currentRates.blendedAprWad) {
    optimizedFinalAlloc = currentUser
    optimizedRates = currentRates
  }
  // Also, if a "no-rebalance" baseline exists, never return something strictly worse than it.
  if (baselineAllocForFallback && baselineRatesForFallback && optimizedRates.blendedAprWad < baselineRatesForFallback.blendedAprWad) {
    optimizedFinalAlloc = baselineAllocForFallback
    optimizedRates = baselineRatesForFallback
  }

  const positionsOut: OptimizedPositionDelta[] = []
  for (let i = 0; i < n; i++) {
    const cur = currentUser[i]
    const fin = optimizedFinalAlloc[i]
    if (cur === 0n && fin === 0n)
      continue

    const modeledMarket: SupplyOptimizerMarketSnapshot = {
      ...markets[i],
      totalSupplyAssets: exUserSupply[i] + fin,
    }

    const { utilizationAfterWad, supplyAprWad, supplyApyWad } = computeSupplyAfterDeltaWad({
      market: modeledMarket,
      deltaSupplyAssets: 0n,
      timestamp,
    })

    positionsOut.push({
      marketId: markets[i].marketId,
      uniqueKey: markets[i].uniqueKey,
      currentUserAssets: cur,
      amountAssets: fin,
      deltaAssets: fin - cur,
      maxWithdrawAssets: maxWithdraw[i],
      minFinalAssets: minFinal[i],
      utilizationAfterWad,
      supplyAprAfterWad: supplyAprWad,
      supplyApyAfterWad: supplyApyWad,
    })
  }

  positionsOut.sort((a, b) => (a.amountAssets === b.amountAssets ? 0 : (a.amountAssets > b.amountAssets ? -1 : 1)))

  // Remaining is leftover TARGET allocation; if newDepositAssets < 0, this isn't "leftover deposit".
  // For the common "newDeposit >= 0" case, this is the unallocated portion of the new deposit.
  const unallocatedNewDepositAssets = newDepositAssets > 0n ? remaining : 0n

  return {
    current: currentRates,
    currentAtTargetProRata: currentAtTargetProRata
      ? { totalAssets: targetTotal, blendedAprWad: currentAtTargetProRata.blendedAprWad, blendedApyWad: currentAtTargetProRata.blendedApyWad }
      : undefined,
    baselineNoRebalance,
    optimized: { totalAssets: targetTotal, blendedAprWad: optimizedRates.blendedAprWad, blendedApyWad: optimizedRates.blendedApyWad },
    positions: positionsOut,
    iterations,
    unallocatedNewDepositAssets,
    infeasibleWithdrawAssets,
  }
}
