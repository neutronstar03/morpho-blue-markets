import type { OptimizeSupplyWithPositionsArgs, OptimizeSupplyWithPositionsResult } from './supply-optimizer'
import { getMoveSizeBaseTotalAssets, optimizeSupplyWithMoveSizeHeuristic } from './move-size-heuristic'
import { optimizeSupplyAllocationWithPositions } from './supply-optimizer'

const WAD = 10n ** 18n
// Default: opening a new market should only be rejected if it is strictly worse (negative marginal benefit).
// A portfolio-size-based threshold is unintuitive when the optimizer step is small.
const DEFAULT_MIN_NEW_MARKET_BENEFIT_WAD = 0n

// For rebalance-only runs (no newDeposit), require a tiny edge to open new markets.
// 2 bps = 0.02%.
const DEFAULT_REBALANCE_NEW_MARKET_HYSTERESIS_APR_WAD = 200_000_000_000_000n

export interface AutoMoveSizeInfo {
  stepAssets: bigint
  stepRatioWad: bigint
  attempts: number
  fromHeuristic: boolean
}

export interface SupplyOptimizerRunArgs extends Omit<OptimizeSupplyWithPositionsArgs, 'stepAssets'> {
  stepAssets?: bigint
  maxIterations: number
  auto: boolean
}

export interface SupplyOptimizerRunResult {
  status: 'success' | 'failed'
  result?: OptimizeSupplyWithPositionsResult
  stepAssets?: bigint
  autoInfo?: AutoMoveSizeInfo
  error?: string
}

export function runSupplyOptimizer(args: SupplyOptimizerRunArgs): SupplyOptimizerRunResult {
  const baseTotalAssets = getMoveSizeBaseTotalAssets(args.positions, args.newDepositAssets)
  let stepAssets = args.stepAssets
  let autoInfo: AutoMoveSizeInfo | undefined
  let result = undefined as OptimizeSupplyWithPositionsResult | undefined

  const baseConstraints = {
    ...args.constraints,
    // Keep an explicit absolute gate available, but default it to 0 (disabled).
    minNewMarketBenefitWad: args.constraints?.minNewMarketBenefitWad ?? DEFAULT_MIN_NEW_MARKET_BENEFIT_WAD,
    // Relative gating: only apply (by default) when not adding new capital.
    newMarketHysteresisAprWad: args.constraints?.newMarketHysteresisAprWad
      ?? (args.newDepositAssets > 0n ? 0n : DEFAULT_REBALANCE_NEW_MARKET_HYSTERESIS_APR_WAD),
  }

  const runManual = (manualStepAssets: bigint): OptimizeSupplyWithPositionsResult => {
    return optimizeSupplyAllocationWithPositions({
      markets: args.markets,
      positions: args.positions,
      newDepositAssets: args.newDepositAssets,
      stepAssets: manualStepAssets,
      timestamp: args.timestamp,
      constraints: {
        ...baseConstraints,
      },
      maxIterations: args.maxIterations,
    })
  }

  if (args.auto) {
    if (stepAssets != null && stepAssets > 0n) {
      const cachedResult = runManual(stepAssets)
      if (cachedResult.iterations < args.maxIterations) {
        result = cachedResult
        autoInfo = {
          stepAssets,
          stepRatioWad: baseTotalAssets > 0n ? (stepAssets * WAD) / baseTotalAssets : 0n,
          attempts: 0,
          fromHeuristic: false,
        }
      }
      else {
        stepAssets = undefined
      }
    }

    if (stepAssets == null) {
      const heuristicResult = optimizeSupplyWithMoveSizeHeuristic({
        markets: args.markets,
        positions: args.positions,
        newDepositAssets: args.newDepositAssets,
        timestamp: args.timestamp,
        constraints: baseConstraints,
        maxIterations: args.maxIterations,
      })
      if (heuristicResult.status !== 'success' || !heuristicResult.result) {
        return {
          status: 'failed',
          error: heuristicResult.error ?? 'Auto move size failed to converge. Try a manual value.',
        }
      }
      stepAssets = heuristicResult.stepAssets
      result = heuristicResult.result
      autoInfo = {
        stepAssets,
        stepRatioWad: heuristicResult.stepRatioWad,
        attempts: heuristicResult.attempts,
        fromHeuristic: true,
      }
    }
  }

  if (stepAssets == null || stepAssets <= 0n) {
    return {
      status: 'failed',
      error: 'Minimum move size must be > 0',
    }
  }

  if (!result) {
    result = runManual(stepAssets)
  }

  return {
    status: 'success',
    result,
    stepAssets,
    autoInfo,
  }
}
