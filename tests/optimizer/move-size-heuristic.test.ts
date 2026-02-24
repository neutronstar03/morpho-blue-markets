import type { SupplyOptimizerMarketSnapshot, UserSupplyPosition } from '../../app/lib/optimizer/supply-optimizer'
import { describe, expect, test } from 'bun:test'
import { getMoveSizeBaseTotalAssets } from '../../app/lib/optimizer/move-size-heuristic'
import { optimizeSupplyAllocationWithPositions } from '../../app/lib/optimizer/supply-optimizer'
import { runSupplyOptimizer } from '../../app/lib/optimizer/supply-optimizer-runner'

const WAD = 10n ** 18n
const DEFAULT_MIN_PCT_WAD = 10n ** 13n // 0.001%
const DEFAULT_MAX_PCT_WAD = 5n * 10n ** 16n // 5%
const DEFAULT_TARGET_ITERATIONS = 300

/*
 * Test objective recap:
 * - The optimizer chooses allocations by greedy APR-improvement steps.
 * - In auto mode, it first picks a step size (`stepAssets`) so runtime stays inside
 *   an iteration budget, then runs the allocation with that step.
 * - These tests protect both sides:
 *   1) control-plane behavior (when heuristic must re-run or reuse cache), and
 *   2) outcome quality (auto sizing should stay close to the best APR achievable
 *      among budget-respecting step sizes).
 */

function stepFromPercent(totalAssets: bigint, percentWad: bigint): bigint {
  if (totalAssets <= 0n)
    return 0n
  let step = (totalAssets * percentWad) / WAD
  if (step <= 0n)
    step = 1n
  return step > totalAssets ? totalAssets : step
}

// Oracle helper: brute-force the heuristic search interval and return the smallest
// step that satisfies the iteration target.
function findMinimalStepWithinTargetIterations(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
  maxIterations: number
  targetIterations: number
}): bigint {
  const baseTotalAssets = getMoveSizeBaseTotalAssets(args.positions, 0n)
  const minStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MIN_PCT_WAD)
  const maxStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MAX_PCT_WAD)
  const cappedMaxStepAssets = maxStepAssets >= minStepAssets ? maxStepAssets : minStepAssets

  for (let stepAssets = minStepAssets; stepAssets <= cappedMaxStepAssets; stepAssets++) {
    const run = optimizeSupplyAllocationWithPositions({
      markets: args.markets,
      positions: args.positions,
      newDepositAssets: 0n,
      stepAssets,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations: args.maxIterations,
    })
    if (run.iterations <= args.targetIterations)
      return stepAssets
  }

  throw new Error('No step found within target iterations in heuristic range.')
}

// Oracle helper: find a cached step that is guaranteed to hit the iteration cap,
// forcing `runSupplyOptimizer` to discard cache and recompute via heuristic.
function findAnyStepAtIterationCap(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
  maxIterations: number
}): bigint {
  const baseTotalAssets = getMoveSizeBaseTotalAssets(args.positions, 0n)
  const minStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MIN_PCT_WAD)
  const maxStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MAX_PCT_WAD)
  const cappedMaxStepAssets = maxStepAssets >= minStepAssets ? maxStepAssets : minStepAssets

  for (let stepAssets = minStepAssets; stepAssets <= cappedMaxStepAssets; stepAssets++) {
    const run = optimizeSupplyAllocationWithPositions({
      markets: args.markets,
      positions: args.positions,
      newDepositAssets: 0n,
      stepAssets,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations: args.maxIterations,
    })
    if (run.iterations >= args.maxIterations)
      return stepAssets
  }

  throw new Error('No capped-iteration step found in heuristic range.')
}

// Oracle helper: find a cached step that is already under the strict hard cap,
// so auto mode can safely reuse it without invoking heuristic.
function findAnyStepBelowIterationCap(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
  maxIterations: number
}): bigint {
  const baseTotalAssets = getMoveSizeBaseTotalAssets(args.positions, 0n)
  const minStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MIN_PCT_WAD)
  const maxStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MAX_PCT_WAD)
  const cappedMaxStepAssets = maxStepAssets >= minStepAssets ? maxStepAssets : minStepAssets

  for (let stepAssets = minStepAssets; stepAssets <= cappedMaxStepAssets; stepAssets++) {
    const run = optimizeSupplyAllocationWithPositions({
      markets: args.markets,
      positions: args.positions,
      newDepositAssets: 0n,
      stepAssets,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations: args.maxIterations,
    })
    if (run.iterations < args.maxIterations)
      return stepAssets
  }

  throw new Error('No under-cap step found in heuristic range.')
}

function createNonZeroYieldScenario(): {
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
  newDepositAssets: bigint
  constraints: { maxMarketsUsed: number }
  timestamp: bigint
} {
  const markets: SupplyOptimizerMarketSnapshot[] = [
    {
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000001',
      uniqueKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      totalSupplyAssets: 1_000_000n,
      totalBorrowAssets: 900_000n,
      lastUpdate: 1n,
      feeWad: 0n,
      rateAtTarget: 6n * 10n ** 16n,
    },
    {
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000002',
      uniqueKey: '0x0000000000000000000000000000000000000000000000000000000000000002',
      totalSupplyAssets: 1_000_000n,
      totalBorrowAssets: 850_000n,
      lastUpdate: 1n,
      feeWad: 0n,
      rateAtTarget: 5n * 10n ** 16n,
    },
    {
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000003',
      uniqueKey: '0x0000000000000000000000000000000000000000000000000000000000000003',
      totalSupplyAssets: 1_000_000n,
      totalBorrowAssets: 300_000n,
      lastUpdate: 1n,
      feeWad: 0n,
      rateAtTarget: 2n * 10n ** 16n,
    },
  ]

  const positions: UserSupplyPosition[] = [
    { marketId: markets[0].marketId, suppliedAssets: 1_800n },
    { marketId: markets[1].marketId, suppliedAssets: 1_200n },
    { marketId: markets[2].marketId, suppliedAssets: 600n },
  ]

  return {
    markets,
    positions,
    newDepositAssets: 2_400n,
    constraints: { maxMarketsUsed: 2 },
    timestamp: 1n,
  }
}

function findBestAprStepWithinTargetIterations(args: {
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
  newDepositAssets: bigint
  constraints: { maxMarketsUsed: number }
  timestamp: bigint
  maxIterations: number
  targetIterations: number
}): { stepAssets: bigint, blendedAprWad: bigint } {
  const baseTotalAssets = getMoveSizeBaseTotalAssets(args.positions, args.newDepositAssets)
  const minStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MIN_PCT_WAD)
  const maxStepAssets = stepFromPercent(baseTotalAssets, DEFAULT_MAX_PCT_WAD)
  const cappedMaxStepAssets = maxStepAssets >= minStepAssets ? maxStepAssets : minStepAssets

  let bestStepAssets: bigint | undefined
  let bestAprWad = -1n

  for (let stepAssets = minStepAssets; stepAssets <= cappedMaxStepAssets; stepAssets++) {
    const run = optimizeSupplyAllocationWithPositions({
      markets: args.markets,
      positions: args.positions,
      newDepositAssets: args.newDepositAssets,
      stepAssets,
      timestamp: args.timestamp,
      constraints: args.constraints,
      maxIterations: args.maxIterations,
    })

    if (run.iterations > args.targetIterations)
      continue

    if (run.optimized.blendedAprWad > bestAprWad) {
      bestAprWad = run.optimized.blendedAprWad
      bestStepAssets = stepAssets
    }
  }

  if (bestStepAssets == null)
    throw new Error('No budget-respecting step found in heuristic range.')

  return { stepAssets: bestStepAssets, blendedAprWad: bestAprWad }
}

async function loadFixture(): Promise<{
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
}> {
  const fixtureUrl = new URL('./fixtures/move-size-snapshot.json', import.meta.url)
  const text = await Bun.file(fixtureUrl).text()
  const fixture = JSON.parse(text) as {
    markets: Array<{
      marketId: string
      uniqueKey: string
      totalSupplyAssets: string
      totalBorrowAssets: string
      lastUpdate: string
      feeWad: string
      rateAtTarget: string
    }>
    positions: Array<{
      marketId: string
      suppliedAssets: string
    }>
  }

  const markets = fixture.markets.map(m => ({
    marketId: m.marketId as `0x${string}`,
    uniqueKey: m.uniqueKey as `0x${string}`,
    totalSupplyAssets: BigInt(m.totalSupplyAssets),
    totalBorrowAssets: BigInt(m.totalBorrowAssets),
    lastUpdate: BigInt(m.lastUpdate),
    feeWad: BigInt(m.feeWad),
    rateAtTarget: BigInt(m.rateAtTarget),
  }))

  const positions = fixture.positions.map(p => ({
    marketId: p.marketId as `0x${string}`,
    suppliedAssets: BigInt(p.suppliedAssets),
  }))

  return { markets, positions }
}

describe('Move size heuristic', () => {
  // Control-plane tests for step-size caching and fallback.
  // Why this matters: if we keep stale cached steps, optimizer can silently run at
  // iteration cap and lose convergence guarantees.
  test('re-runs heuristic when cached step is over target iteration budget', async () => {
    const { markets, positions } = await loadFixture()
    const maxIterations = 25
    const targetIterations = 25
    const overBudgetStep = findAnyStepAtIterationCap({ markets, positions, maxIterations })
    const minimalPassingStep = findMinimalStepWithinTargetIterations({ markets, positions, maxIterations, targetIterations })

    const result = runSupplyOptimizer({
      markets,
      positions,
      newDepositAssets: 0n,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations,
      auto: true,
      stepAssets: overBudgetStep,
    })

    expect(result.status).toBe('success')
    expect(result.autoInfo?.fromHeuristic).toBe(true)
    expect(result.autoInfo?.attempts ?? 0).toBeGreaterThan(0)
    expect(result.stepAssets).toBe(minimalPassingStep)
    expect(result.result?.iterations ?? 0).toBeLessThanOrEqual(targetIterations)
  })

  test('picks the minimal step that satisfies target iteration budget', async () => {
    const { markets, positions } = await loadFixture()
    const maxIterations = 25
    const targetIterations = 25
    const expectedStep = findMinimalStepWithinTargetIterations({ markets, positions, maxIterations, targetIterations })

    const result = runSupplyOptimizer({
      markets,
      positions,
      newDepositAssets: 0n,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations,
      auto: true,
    })

    expect(result.status).toBe('success')
    expect(result.stepAssets).toBe(expectedStep)
    expect(result.result?.iterations ?? 0).toBeLessThanOrEqual(targetIterations)
    expect(result.autoInfo?.attempts ?? 0).toBeGreaterThan(0)
  })

  test('keeps cached step when already within target iteration budget', async () => {
    const { markets, positions } = await loadFixture()
    const maxIterations = 25
    const cachedPassingStep = findAnyStepBelowIterationCap({ markets, positions, maxIterations })

    const result = runSupplyOptimizer({
      markets,
      positions,
      newDepositAssets: 0n,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations,
      auto: true,
      stepAssets: cachedPassingStep,
    })

    expect(result.status).toBe('success')
    expect(result.autoInfo?.fromHeuristic).toBe(false)
    expect(result.autoInfo?.attempts).toBe(0)
    expect(result.stepAssets).toBe(cachedPassingStep)
    expect(result.result?.iterations ?? 0).toBeLessThan(maxIterations)
  })

  // Outcome-quality guardrail for non-zero-yield markets.
  // Why this matters: we do not want auto step sizing to be fast-but-poor.
  // The check compares auto mode against a brute-force oracle over the same
  // heuristic search range, restricted to budget-respecting steps.
  test('auto step is close to best APR among budget-respecting steps', () => {
    const scenario = createNonZeroYieldScenario()
    const maxIterations = 1_000
    const targetIterations = DEFAULT_TARGET_ITERATIONS

    const oracle = findBestAprStepWithinTargetIterations({
      ...scenario,
      maxIterations,
      targetIterations,
    })

    const auto = runSupplyOptimizer({
      ...scenario,
      maxIterations,
      auto: true,
    })

    expect(auto.status).toBe('success')
    expect(auto.autoInfo?.fromHeuristic).toBe(true)

    const autoAprWad = auto.result?.optimized.blendedAprWad ?? 0n
    // Keep the threshold strict: auto APR must be within 1 bps of brute-force best.
    // Equivalent to: autoApr >= 99.99% of bestApr.
    expect(autoAprWad * 10_000n).toBeGreaterThanOrEqual(oracle.blendedAprWad * 9_999n)
  })
})
