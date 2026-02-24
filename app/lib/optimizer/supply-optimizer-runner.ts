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
  onProgress?: (progress: SupplyOptimizerProgress) => void
}

export interface SupplyOptimizerProgress {
  phase: 'sizing-step' | 'optimizing' | 'finalizing'
  label: string
  percent?: number
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

  const runManual = (manualStepAssets: bigint, withIterationProgress: boolean): OptimizeSupplyWithPositionsResult => {
    if (withIterationProgress) {
      args.onProgress?.({
        phase: 'optimizing',
        label: 'Optimizing',
        percent: 10,
      })
    }

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
      onIterationProgress: withIterationProgress
        ? ({ iterations, maxIterations }) => {
            const pct = Math.min(95, Math.max(10, Math.floor((iterations * 100) / Math.max(1, maxIterations))))
            args.onProgress?.({
              phase: 'optimizing',
              label: 'Optimizing',
              percent: pct,
            })
          }
        : undefined,
    })
  }

  if (args.auto) {
    if (stepAssets != null && stepAssets > 0n) {
      const cachedResult = runManual(stepAssets, true)
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
      args.onProgress?.({
        phase: 'sizing-step',
        label: 'Sizing step',
        percent: 5,
      })
      const heuristicResult = optimizeSupplyWithMoveSizeHeuristic({
        markets: args.markets,
        positions: args.positions,
        newDepositAssets: args.newDepositAssets,
        timestamp: args.timestamp,
        constraints: baseConstraints,
        maxIterations: args.maxIterations,
        onProgress: ({ attempts, maxAttempts }) => {
          const pct = Math.min(80, Math.max(5, Math.floor((attempts * 100) / Math.max(1, maxAttempts))))
          args.onProgress?.({
            phase: 'sizing-step',
            label: 'Sizing step',
            percent: pct,
          })
        },
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
    result = runManual(stepAssets, true)
  }

  args.onProgress?.({
    phase: 'finalizing',
    label: 'Finalizing',
    percent: 100,
  })

  return {
    status: 'success',
    result,
    stepAssets,
    autoInfo,
  }
}
