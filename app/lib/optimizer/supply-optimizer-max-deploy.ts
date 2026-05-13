/**
 * Max Deploy optimizer — alternative strategy that prioritizes deploying as much
 * capital as possible into Morpho markets while the supply APR stays above a
 * base rate (the "Market APR" / fallback APR).
 *
 * Key difference from the "Max Yield" optimizer in supply-optimizer.ts:
 *   If a market's current supply APR (with the user's existing position) is >= holdAboveAprWad,
 *   the optimizer will NOT withdraw from that market, regardless of whether a higher-APR
 *   market exists. This prevents "churn" where the optimizer creates transient utilization
 *   spikes by withdrawing from profitable-but-not-best positions.
 *
 * The hold-above-base constraint is applied in the minFinal initialization phase.
 * Everything else — greedy step-by-step allocation, minSupplyAprWad filtering,
 * marginal yield scoring, hysteresis, and guardrails — remains the same.
 */

import type { OptimizedPositionDelta, OptimizeSupplyWithPositionsArgs, OptimizeSupplyWithPositionsResult, SupplyOptimizerConstraints, SupplyOptimizerMarketSnapshot } from './supply-optimizer'
import { computeRewardsAwareSupplyAfterDeltaWad } from './supply-optimizer'
import { addDepositProRata, getPerMarketCap, max0, minBigint, normalizeId, sumBigints } from './supply-optimizer-utils'

function blendedRatesFromFinalAllocations(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  finalUserAllocations: readonly bigint[]
  exUserSupplyAssets: readonly bigint[]
  timestamp: bigint
  fallbackIndex?: number
  fallbackAprWad?: bigint
}): { totalAssets: bigint, blendedAprWad: bigint, blendedApyWad: bigint } {
  const { markets, finalUserAllocations, exUserSupplyAssets, timestamp, fallbackIndex, fallbackAprWad } = args
  let total = 0n
  let wApr = 0n
  let wApy = 0n
  for (let i = 0; i < finalUserAllocations.length; i++) {
    const amt = finalUserAllocations[i]
    if (amt <= 0n)
      continue

    let supplyAprWad: bigint
    let supplyApyWad: bigint

    if (fallbackIndex != null && i === fallbackIndex) {
      const apr = fallbackAprWad ?? 0n
      supplyAprWad = apr
      supplyApyWad = apr
    }
    else {
      const modeledMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupplyAssets[i] + finalUserAllocations[i],
      }
      const rates = computeRewardsAwareSupplyAfterDeltaWad({
        market: modeledMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      supplyAprWad = rates.supplyAprWad
      supplyApyWad = rates.supplyApyWad
    }

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

function allocationRatesAtIndex(args: {
  index: number
  markets: SupplyOptimizerMarketSnapshot[]
  finalUserAllocations: readonly bigint[]
  exUserSupplyAssets: readonly bigint[]
  timestamp: bigint
  fallbackIndex?: number
  fallbackAprWad?: bigint
}): {
  utilizationAfterWad: bigint
  supplyAprWad: bigint
  supplyApyWad: bigint
} {
  const { index, markets, finalUserAllocations, exUserSupplyAssets, timestamp, fallbackIndex, fallbackAprWad } = args
  if (fallbackIndex != null && index === fallbackIndex) {
    const apr = fallbackAprWad ?? 0n
    return {
      utilizationAfterWad: 0n,
      supplyAprWad: apr,
      supplyApyWad: apr,
    }
  }

  const modeledMarket: SupplyOptimizerMarketSnapshot = {
    ...markets[index],
    totalSupplyAssets: exUserSupplyAssets[index] + finalUserAllocations[index],
  }
  const { utilizationAfterWad, supplyAprWad, supplyApyWad } = computeRewardsAwareSupplyAfterDeltaWad({
    market: modeledMarket,
    deltaSupplyAssets: 0n,
    timestamp,
  })
  return { utilizationAfterWad, supplyAprWad, supplyApyWad }
}

/**
 * Shared greedy allocator used for "add assets upward from a fixed starting point" flows.
 * Identical to the one in supply-optimizer.ts, duplicated here for independent evolution.
 */
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
  fallbackIndex?: number
  fallbackAprWad?: bigint
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
    fallbackIndex,
    fallbackAprWad,
  } = args

  if (stepAssets <= 0n)
    throw new Error('stepAssets must be > 0')

  let remaining = remainingIn
  const minAprWad = constraints?.minSupplyAprWad
  const minNewMarketBenefitWad = constraints?.minNewMarketBenefitWad
  const minNewMarketAssets = constraints?.minNewMarketAssets ?? stepAssets
  const maxMarketsUsed = constraints?.maxMarketsUsed
  const newMarketHysteresisAprWad = constraints?.newMarketHysteresisAprWad
  const holdAboveAprWad = constraints?.holdAboveAprWad

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestNewIdx = -1
    let bestNewStep = 0n
    let bestExistingIdx = -1
    let bestExistingStep = 0n
    let bestNewScore = -(2n ** 255n)
    let bestExistingScore = -(2n ** 255n)

    for (let i = 0; i < allocations.length; i++) {
      const isFallback = fallbackIndex != null && i === fallbackIndex
      if (!isFallback && maxMarketsUsed != null && maxMarketsUsed > 0 && allocations[i] === 0n && used.size >= maxMarketsUsed)
        continue

      const capRemaining = isFallback ? (2n ** 255n) : (maxFinal[i] - allocations[i])
      if (capRemaining <= 0n)
        continue

      let step = minBigint(stepAssets, remaining)
      step = minBigint(step, capRemaining)
      if (step <= 0n)
        continue

      const currentFinal = allocations[i]

      if (isFallback) {
        const apr = fallbackAprWad ?? 0n
        const candidateFinalForScore = allocations[i] + step
        const score = (candidateFinalForScore * apr) - (currentFinal * apr)
        if (currentFinal === 0n) {
          if (score > bestNewScore) {
            bestNewScore = score
            bestNewIdx = i
            bestNewStep = step
          }
        }
        else if (score > bestExistingScore) {
          bestExistingScore = score
          bestExistingIdx = i
          bestExistingStep = step
        }
        continue
      }

      // Max-deploy: skip adding to markets already held above base rate when
      // the market's APR after adding would NOT increase the position's marginal
      // benefit above the base rate. This prevents over-concentrating into
      // a single held market.
      // The minSupplyAprWad filter below already handles the hard APR floor,
      // so we don't need separate logic here.

      const isLastSlotNewMarket = (currentFinal === 0n)
        && (maxMarketsUsed != null && maxMarketsUsed > 0)
        && (used.size === (maxMarketsUsed - 1))

      if (currentFinal === 0n && minNewMarketAssets != null && minNewMarketAssets > 0n) {
        if (remaining < minNewMarketAssets)
          continue
        const desired = minBigint(minNewMarketAssets, capRemaining)
        if (desired <= 0n)
          continue
        step = desired > step ? desired : step
        step = minBigint(step, remaining)
        step = minBigint(step, capRemaining)
        if (step < minNewMarketAssets)
          continue
      }

      let scoreStep = step
      if (isLastSlotNewMarket) {
        const probe = minBigint(remaining, capRemaining)
        if (probe > scoreStep)
          scoreStep = probe
      }
      const candidateFinalForScore = allocations[i] + scoreStep

      const currentMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupplyAssets[i] + currentFinal,
      }
      const modeledMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupplyAssets[i] + candidateFinalForScore,
      }

      const { supplyAprWad: supplyAprCurrentWad } = computeRewardsAwareSupplyAfterDeltaWad({
        market: currentMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      const { supplyAprWad } = computeRewardsAwareSupplyAfterDeltaWad({
        market: modeledMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      if (minAprWad != null && supplyAprWad < minAprWad)
        continue

      // Marginal annualized benefit scoring (same as max-yield).
      const score = (candidateFinalForScore * supplyAprWad) - (currentFinal * supplyAprCurrentWad)

      // Max-deploy: if holdAboveAprWad is set and this market is currently held
      // (meaning currentFinal == currentUser[i] from the hold logic), check that
      // adding more still produces excess benefit above the base rate.
      // This prevents the greedy loop from over-concentrating into a single
      // held market when other markets offer similar excess returns.
      if (holdAboveAprWad != null && holdAboveAprWad > 0n && currentFinal > 0n) {
        // Only add more if the post-step APR is still above the hold threshold
        if (supplyAprWad < holdAboveAprWad)
          continue
      }

      if (minNewMarketBenefitWad != null && currentFinal === 0n && score < minNewMarketBenefitWad)
        continue

      if (currentFinal === 0n) {
        if (score > bestNewScore) {
          bestNewScore = score
          bestNewIdx = i
          bestNewStep = step
        }
      }
      else {
        if (score > bestExistingScore) {
          bestExistingScore = score
          bestExistingIdx = i
          bestExistingStep = step
        }
      }
    }

    if (bestNewIdx < 0 && bestExistingIdx < 0)
      break

    let chosenIdx = bestExistingIdx
    let chosenStep = bestExistingStep

    if (bestNewIdx >= 0 && (bestExistingIdx < 0 || bestNewScore > bestExistingScore)) {
      let allowNew = true
      if (bestExistingIdx >= 0 && newMarketHysteresisAprWad != null && newMarketHysteresisAprWad > 0n) {
        const hysteresisBenefitWad = stepAssets * newMarketHysteresisAprWad
        if (bestNewScore < bestExistingScore + hysteresisBenefitWad)
          allowNew = false
      }
      if (allowNew) {
        chosenIdx = bestNewIdx
        chosenStep = bestNewStep
      }
    }

    if (chosenIdx < 0 || chosenStep <= 0n)
      break

    allocations[chosenIdx] += chosenStep
    if ((fallbackIndex == null || chosenIdx !== fallbackIndex) && allocations[chosenIdx] > 0n)
      used.add(chosenIdx)
    remaining -= chosenStep
    iterations++
  }

  return { remaining, iterations }
}

/**
 * Max Deploy optimizer: hold positions earning above a base rate, and only
 * withdraw from markets below the base rate. This produces allocations that
 * maximize total capital deployed in Morpho markets above the opportunity cost
 * (typically the Morpho Vault rate), rather than chasing the highest marginal
 * yield by withdrawing from profitable-but-not-best positions.
 *
 * The interface is identical to optimizeSupplyAllocationWithPositions() from
 * supply-optimizer.ts. The only behavioral difference is in the minFinal
 * initialization: markets with currentSupplyAPR >= holdAboveAprWad have their
 * minFinal raised to at least currentUser, preventing withdrawal.
 *
 * holdAboveAprWad defaults to fallbackAprWad when not explicitly set.
 */
export function optimizeMaxDeployWithPositions(args: OptimizeSupplyWithPositionsArgs): OptimizeSupplyWithPositionsResult {
  const {
    markets,
    positions,
    newDepositAssets,
    stepAssets,
    timestamp,
    constraints,
    allowRebalance = true,
    maxIterations = 500,
    onIterationProgress,
  } = args

  if (stepAssets <= 0n)
    throw new Error('stepAssets must be > 0')

  const n = markets.length
  const fallbackAprWad = constraints?.fallbackAprWad
  const hasFallback = fallbackAprWad != null && fallbackAprWad >= 0n
  const fallbackIndex = hasFallback ? n : undefined
  const fallbackLabel = constraints?.fallbackLabel ?? 'Withdraw to wallet'

  // In max-deploy mode, holdAboveAprWad defaults to fallbackAprWad
  const holdAboveAprWad = constraints?.holdAboveAprWad ?? (hasFallback ? fallbackAprWad : undefined)

  if (n === 0) {
    return {
      current: { totalAssets: 0n, blendedAprWad: 0n, blendedApyWad: 0n },
      currentAtTargetProRata: undefined,
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

  const totalSlots = n + (hasFallback ? 1 : 0)
  const currentUser: bigint[] = Array.from({ length: totalSlots }, () => 0n)
  const exUserSupply: bigint[] = Array.from({ length: totalSlots }, () => 0n)
  const maxWithdraw: bigint[] = Array.from({ length: totalSlots }, () => 0n)
  const minFinal: bigint[] = Array.from({ length: totalSlots }, () => 0n)
  const maxFinal: bigint[] = Array.from({ length: totalSlots }, () => 0n)

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

    // *** MAX-DEPLOY: Hold positions above base rate ***
    // If this market's current supply APR (with the user's position) is >= holdAboveAprWad,
    // raise the floor so the optimizer cannot withdraw from this position.
    if (holdAboveAprWad != null && holdAboveAprWad > 0n && u > 0n) {
      const currentMarket: SupplyOptimizerMarketSnapshot = {
        ...m,
        totalSupplyAssets: m.totalSupplyAssets, // user is included in totalSupply on-chain
      }
      const { supplyAprWad } = computeRewardsAwareSupplyAfterDeltaWad({
        market: currentMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      if (supplyAprWad >= holdAboveAprWad) {
        // Hold this position — don't withdraw from a market earning above the base rate.
        minFinal[i] = minFinal[i] > u ? minFinal[i] : u
      }
    }

    // Ex-user supply baseline (avoid double-counting the user in totalSupplyAssets).
    exUserSupply[i] = max0(m.totalSupplyAssets - u)

    const cap = getPerMarketCap(m, constraints)
    maxFinal[i] = cap != null ? cap : (2n ** 255n) // large sentinel

    if (minFinal[i] > maxFinal[i])
      throw new Error(`Infeasible: minFinal > maxFinal for market ${m.marketId}`)
  }

  const currentTotal = sumBigints(currentUser)
  const targetTotal = currentTotal + newDepositAssets

  // Seed with the minimum feasible finals, then only optimize the remaining amount.
  const finalAlloc = [...minFinal]
  const minSum = sumBigints(minFinal)

  let infeasibleWithdrawAssets = 0n
  let remaining = targetTotal - minSum
  if (remaining < 0n) {
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
  const minNewMarketAssets = constraints?.minNewMarketAssets ?? stepAssets
  const maxMarketsUsed = constraints?.maxMarketsUsed
  const newMarketHysteresisAprWad = constraints?.newMarketHysteresisAprWad

  let iterations = 0
  while (remaining > 0n && iterations < maxIterations) {
    let bestNewIdx = -1
    let bestNewStep = 0n
    let bestExistingIdx = -1
    let bestExistingStep = 0n
    let bestNewScore = -(2n ** 255n)
    let bestExistingScore = -(2n ** 255n)

    for (let i = 0; i < totalSlots; i++) {
      const isFallback = fallbackIndex != null && i === fallbackIndex
      if (!isFallback && maxMarketsUsed != null && maxMarketsUsed > 0 && finalAlloc[i] === 0n && used.size >= maxMarketsUsed)
        continue

      const capRemaining = isFallback ? (2n ** 255n) : (maxFinal[i] - finalAlloc[i])
      if (capRemaining <= 0n)
        continue

      let step = minBigint(stepAssets, remaining)
      step = minBigint(step, capRemaining)
      if (step <= 0n)
        continue

      const currentFinal = finalAlloc[i]

      if (isFallback) {
        const apr = fallbackAprWad ?? 0n
        const candidateFinalForScore = currentFinal + step
        const score = (candidateFinalForScore * apr) - (currentFinal * apr)
        if (currentFinal === 0n) {
          if (score > bestNewScore) {
            bestNewScore = score
            bestNewIdx = i
            bestNewStep = step
          }
        }
        else if (score > bestExistingScore) {
          bestExistingScore = score
          bestExistingIdx = i
          bestExistingStep = step
        }
        continue
      }

      const isLastSlotNewMarket = (currentFinal === 0n)
        && (maxMarketsUsed != null && maxMarketsUsed > 0)
        && (used.size === (maxMarketsUsed - 1))

      if (currentFinal === 0n && minNewMarketAssets != null && minNewMarketAssets > 0n) {
        if (remaining < minNewMarketAssets)
          continue
        const desired = minBigint(minNewMarketAssets, capRemaining)
        if (desired <= 0n)
          continue
        step = desired > step ? desired : step
        step = minBigint(step, remaining)
        step = minBigint(step, capRemaining)
        if (step < minNewMarketAssets)
          continue
      }

      let scoreStep = step
      if (isLastSlotNewMarket) {
        const probe = minBigint(remaining, capRemaining)
        if (probe > scoreStep)
          scoreStep = probe
      }
      const candidateFinalForScore = finalAlloc[i] + scoreStep

      const currentMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupply[i] + currentFinal,
      }
      const modeledMarket: SupplyOptimizerMarketSnapshot = {
        ...markets[i],
        totalSupplyAssets: exUserSupply[i] + candidateFinalForScore,
      }

      const { supplyAprWad: supplyAprCurrentWad } = computeRewardsAwareSupplyAfterDeltaWad({
        market: currentMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      const { supplyAprWad } = computeRewardsAwareSupplyAfterDeltaWad({
        market: modeledMarket,
        deltaSupplyAssets: 0n,
        timestamp,
      })

      // Hard APR floor: skip if post-step APR is below minimum.
      if (minAprWad != null && supplyAprWad < minAprWad)
        continue

      // Marginal annualized benefit scoring (same formula as max-yield).
      const score = (candidateFinalForScore * supplyAprWad) - (currentFinal * supplyAprCurrentWad)

      // Max-deploy: when holdAboveAprWad is set, don't add more to a held market
      // if the post-step APR would drop below the hold threshold.
      if (holdAboveAprWad != null && holdAboveAprWad > 0n && currentFinal > 0n) {
        if (supplyAprWad < holdAboveAprWad)
          continue
      }

      if (minNewMarketBenefitWad != null && currentFinal === 0n && score < minNewMarketBenefitWad)
        continue

      if (currentFinal === 0n) {
        if (score > bestNewScore) {
          bestNewScore = score
          bestNewIdx = i
          bestNewStep = step
        }
      }
      else {
        if (score > bestExistingScore) {
          bestExistingScore = score
          bestExistingIdx = i
          bestExistingStep = step
        }
      }
    }

    if (bestNewIdx < 0 && bestExistingIdx < 0)
      break

    let chosenIdx = bestExistingIdx
    let chosenStep = bestExistingStep

    if (bestNewIdx >= 0 && (bestExistingIdx < 0 || bestNewScore > bestExistingScore)) {
      let allowNew = true
      if (bestExistingIdx >= 0 && newMarketHysteresisAprWad != null && newMarketHysteresisAprWad > 0n) {
        const hysteresisBenefitWad = stepAssets * newMarketHysteresisAprWad
        if (bestNewScore < bestExistingScore + hysteresisBenefitWad)
          allowNew = false
      }
      if (allowNew) {
        chosenIdx = bestNewIdx
        chosenStep = bestNewStep
      }
    }

    if (chosenIdx < 0 || chosenStep <= 0n)
      break

    finalAlloc[chosenIdx] += chosenStep
    if ((fallbackIndex == null || chosenIdx !== fallbackIndex) && finalAlloc[chosenIdx] > 0n)
      used.add(chosenIdx)
    remaining -= chosenStep
    iterations++
    onIterationProgress?.({
      iterations,
      maxIterations,
      remainingAssets: remaining,
      targetTotalAssets: targetTotal,
    })
  }

  // Compute portfolio-level rates for comparison.
  const currentRates = blendedRatesFromFinalAllocations({
    markets,
    finalUserAllocations: currentUser,
    exUserSupplyAssets: exUserSupply,
    timestamp,
    fallbackIndex,
    fallbackAprWad,
  })

  const currentAtTargetProRata = (newDepositAssets > 0n && currentTotal > 0n)
    ? blendedRatesFromFinalAllocations({
        markets,
        finalUserAllocations: addDepositProRata(currentUser, newDepositAssets),
        exUserSupplyAssets: exUserSupply,
        timestamp,
        fallbackIndex,
        fallbackAprWad,
      })
    : undefined

  // Baseline: keep existing allocations, only add new deposit (no withdraw / no rebalance).
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
      fallbackIndex,
      fallbackAprWad,
    })
    const baselineRates = blendedRatesFromFinalAllocations({
      markets,
      finalUserAllocations: baselineAlloc,
      exUserSupplyAssets: exUserSupply,
      timestamp,
      fallbackIndex,
      fallbackAprWad,
    })
    baselineAllocForFallback = baselineAlloc
    baselineRatesForFallback = baselineRates
    baselineNoRebalance = {
      totalAssets: currentTotal + (newDepositAssets - baselineRemaining),
      blendedAprWad: baselineRates.blendedAprWad,
      blendedApyWad: baselineRates.blendedApyWad,
    }
  }

  // Guardrail: never prefer a rebalance outcome that is strictly worse than the current or baseline plan.
  let optimizedFinalAlloc = finalAlloc
  let optimizedRates = blendedRatesFromFinalAllocations({
    markets,
    finalUserAllocations: optimizedFinalAlloc,
    exUserSupplyAssets: exUserSupply,
    timestamp,
    fallbackIndex,
    fallbackAprWad,
  })
  if (newDepositAssets === 0n && optimizedRates.blendedAprWad < currentRates.blendedAprWad) {
    optimizedFinalAlloc = currentUser
    optimizedRates = currentRates
  }
  if (baselineAllocForFallback && baselineRatesForFallback && optimizedRates.blendedAprWad < baselineRatesForFallback.blendedAprWad) {
    optimizedFinalAlloc = baselineAllocForFallback
    optimizedRates = baselineRatesForFallback
  }

  const positionsOut: OptimizedPositionDelta[] = []
  for (let i = 0; i < totalSlots; i++) {
    const cur = currentUser[i]
    const fin = optimizedFinalAlloc[i]
    if (cur === 0n && fin === 0n)
      continue

    const { utilizationAfterWad, supplyAprWad, supplyApyWad } = allocationRatesAtIndex({
      index: i,
      markets,
      finalUserAllocations: optimizedFinalAlloc,
      exUserSupplyAssets: exUserSupply,
      timestamp,
      fallbackIndex,
      fallbackAprWad,
    })

    positionsOut.push({
      marketId: i < n ? markets[i].marketId : 'wallet-fallback',
      uniqueKey: i < n ? markets[i].uniqueKey : undefined,
      destinationKind: i < n ? 'market' : 'wallet',
      label: i < n ? undefined : fallbackLabel,
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
