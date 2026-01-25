import type { OptimizeSupplyWithPositionsArgs, OptimizeSupplyWithPositionsResult, UserSupplyPosition } from './supply-optimizer'
import { optimizeSupplyAllocationWithPositions } from './supply-optimizer'

const WAD = 10n ** 18n
const DEFAULT_MIN_PCT_WAD = 10n ** 13n // 0.001%
const DEFAULT_MAX_PCT_WAD = 5n * 10n ** 16n // 5%
const DEFAULT_MAX_ATTEMPTS = 8
const DEFAULT_TARGET_ITERATIONS = 300

export interface MoveSizeHeuristicConfig {
  minPercentWad?: bigint
  maxPercentWad?: bigint
  maxAttempts?: number
  /**
   * Target iteration budget for the greedy optimizer.
   * Auto move size will choose the smallest stepAssets that stays within this budget.
   */
  targetIterations?: number
}

export interface MoveSizeHeuristicResult {
  status: 'success' | 'failed'
  stepAssets: bigint
  stepRatioWad: bigint
  baseTotalAssets: bigint
  attempts: number
  minStepAssets: bigint
  maxStepAssets: bigint
  result?: OptimizeSupplyWithPositionsResult
  error?: string
}

function minBigint(a: bigint, b: bigint): bigint {
  return a <= b ? a : b
}

function sumPositions(positions: readonly UserSupplyPosition[]): bigint {
  let total = 0n
  for (const p of positions)
    total += p.suppliedAssets
  return total
}

export function getMoveSizeBaseTotalAssets(positions: readonly UserSupplyPosition[], newDepositAssets: bigint): bigint {
  const currentTotal = sumPositions(positions)
  const deposit = newDepositAssets > 0n ? newDepositAssets : 0n
  const targetTotal = currentTotal + deposit
  return targetTotal > 0n ? targetTotal : currentTotal
}

function stepFromPercent(totalAssets: bigint, percentWad: bigint): bigint {
  if (totalAssets <= 0n)
    return 0n
  let step = (totalAssets * percentWad) / WAD
  if (step <= 0n)
    step = 1n
  return minBigint(step, totalAssets)
}

function stepRatioFromTotal(stepAssets: bigint, totalAssets: bigint): bigint {
  if (totalAssets <= 0n)
    return 0n
  return (stepAssets * WAD) / totalAssets
}

export function optimizeSupplyWithMoveSizeHeuristic(args: Omit<OptimizeSupplyWithPositionsArgs, 'stepAssets'> & {
  maxIterations: number
  config?: MoveSizeHeuristicConfig
  baseTotalAssets?: bigint
}): MoveSizeHeuristicResult {
  const { maxIterations, config, baseTotalAssets: baseTotalOverride, ...optimizerArgs } = args
  const maxAttempts = config?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const targetIterations = Math.max(1, Math.min(config?.targetIterations ?? DEFAULT_TARGET_ITERATIONS, maxIterations))

  const baseTotalAssets = baseTotalOverride ?? getMoveSizeBaseTotalAssets(optimizerArgs.positions, optimizerArgs.newDepositAssets)
  if (baseTotalAssets <= 0n) {
    return {
      status: 'failed',
      stepAssets: 0n,
      stepRatioWad: 0n,
      baseTotalAssets,
      attempts: 0,
      minStepAssets: 0n,
      maxStepAssets: 0n,
      error: 'Auto move size requires a positive total position.',
    }
  }

  const minPercentWad = config?.minPercentWad ?? DEFAULT_MIN_PCT_WAD
  const maxPercentWad = config?.maxPercentWad ?? DEFAULT_MAX_PCT_WAD
  const minStepAssets = stepFromPercent(baseTotalAssets, minPercentWad)
  const maxStepAssets = stepFromPercent(baseTotalAssets, maxPercentWad)
  const cappedMaxStepAssets = maxStepAssets >= minStepAssets ? maxStepAssets : minStepAssets

  let attempts = 0
  let stepAssets = minStepAssets
  let lastFailStep: bigint | undefined
  let bestStep: bigint | undefined
  let bestResult: OptimizeSupplyWithPositionsResult | undefined

  while (attempts < maxAttempts && stepAssets > 0n) {
    const result = optimizeSupplyAllocationWithPositions({
      ...optimizerArgs,
      stepAssets,
      maxIterations,
    })
    attempts++

    if (result.iterations <= targetIterations) {
      bestStep = stepAssets
      bestResult = result
      break
    }

    lastFailStep = stepAssets
    if (stepAssets >= cappedMaxStepAssets)
      break

    const next = stepAssets * 10n
    stepAssets = next > cappedMaxStepAssets ? cappedMaxStepAssets : next
    if (stepAssets === lastFailStep)
      break
  }

  if (!bestStep || !bestResult) {
    return {
      status: 'failed',
      stepAssets: lastFailStep ?? minStepAssets,
      stepRatioWad: stepRatioFromTotal(lastFailStep ?? minStepAssets, baseTotalAssets),
      baseTotalAssets,
      attempts,
      minStepAssets,
      maxStepAssets: cappedMaxStepAssets,
      error: 'Auto move size could not reach the target iteration budget.',
    }
  }

  // Refine only when we observed at least one "over-budget" step.
  if (lastFailStep != null) {
    let low = lastFailStep
    let high = bestStep
    while (attempts < maxAttempts && high - low > 1n) {
      const mid = low + ((high - low) / 2n)
      if (mid <= 0n || mid === low || mid === high)
        break

      const result = optimizeSupplyAllocationWithPositions({
        ...optimizerArgs,
        stepAssets: mid,
        maxIterations,
      })
      attempts++

      if (result.iterations <= targetIterations) {
        bestStep = mid
        bestResult = result
        high = mid
      }
      else {
        low = mid
      }
    }
  }

  return {
    status: 'success',
    stepAssets: bestStep,
    stepRatioWad: stepRatioFromTotal(bestStep, baseTotalAssets),
    baseTotalAssets,
    attempts,
    minStepAssets,
    maxStepAssets: cappedMaxStepAssets,
    result: bestResult,
  }
}
