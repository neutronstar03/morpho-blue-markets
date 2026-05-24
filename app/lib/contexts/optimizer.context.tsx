import type { ReactNode } from 'react'
import type { OptimizeSupplyWithPositionsResult, UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import type { OptimizerStrategy } from '~/lib/optimizer/supply-optimizer-runner'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type { OptimizerStrategy }

export interface SupplyAprOptimizerSelection {
  chainId?: number
  loanAssetAddress?: string
  loanAssetSymbol?: string
  loanAssetDecimals?: number
}

export interface SupplyAprOptimizerInputs {
  /** Minimum acceptable APR for supplied markets, in percent units (e.g. "10"). */
  marketApr?: string
  /** Optional: additional amount to supply (new deposit), in token units (e.g. "123.45"). */
  newDepositAmount?: string
  /** Optimization strategy: 'maxYield' (default) or 'maxDeploy' (hold positions above base rate). */
  strategy?: OptimizerStrategy
}

const DEFAULT_MARKET_APR = '10'

export interface SupplyAprOptimizerDerived {
  /** Total currently supplied for the selected loan asset (raw units). */
  totalSuppliedAssets?: bigint
  /** Positions for selected loan asset (raw units). */
  positions?: UserSupplyPosition[]
}

export interface SupplyAprOptimizerRunState {
  isRunning: boolean
  runId: number
  error?: string
  timestamp?: bigint
}

export interface SupplyAprOptimizerState {
  selection: SupplyAprOptimizerSelection
  inputs: SupplyAprOptimizerInputs
  derived: SupplyAprOptimizerDerived
  run: SupplyAprOptimizerRunState
  result?: OptimizeSupplyWithPositionsResult
}

interface SupplyAprOptimizerContextValue extends SupplyAprOptimizerState {
  clear: () => void
  setSelection: (next: SupplyAprOptimizerSelection) => void
  setMarketApr: (v: string | undefined) => void
  setNewDepositAmount: (v: string | undefined) => void
  setStrategy: (v: OptimizerStrategy) => void
  setDerived: (next: SupplyAprOptimizerDerived) => void
  beginRun: (meta?: { timestamp?: bigint }) => number
  cancelRun: (runId: number) => void
  finishRun: (runId: number, res?: OptimizeSupplyWithPositionsResult, err?: string) => void
  applyPrefetchedResult: (res: OptimizeSupplyWithPositionsResult) => void
}

const SupplyAprOptimizerContext = createContext<SupplyAprOptimizerContextValue | null>(null)

export function SupplyAprOptimizerProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<SupplyAprOptimizerSelection>({})
  const [inputs, setInputs] = useState<SupplyAprOptimizerInputs>({ marketApr: DEFAULT_MARKET_APR })
  const [derived, setDerivedState] = useState<SupplyAprOptimizerDerived>({})
  const [run, setRun] = useState<SupplyAprOptimizerRunState>({ isRunning: false, runId: 0 })
  const [result, setResult] = useState<OptimizeSupplyWithPositionsResult | undefined>(undefined)
  const runIdRef = useRef<number>(0)

  const clear = useCallback(() => {
    setSelectionState({})
    setInputs(prev => ({ ...prev, marketApr: DEFAULT_MARKET_APR, newDepositAmount: undefined }))
    setDerivedState({})
    setRun((prev) => {
      const nextRunId = prev.runId + 1
      runIdRef.current = nextRunId
      return { isRunning: false, runId: nextRunId }
    })
    setResult(undefined)
  }, [])

  const setSelection = useCallback((next: SupplyAprOptimizerSelection) => {
    setSelectionState(next)
    // Reset derived + result when changing selection
    setDerivedState({})
    setResult(undefined)
    setRun(prev => ({ ...prev, error: undefined }))
  }, [])

  const setMarketApr = useCallback((v: string | undefined) => {
    setInputs(prev => ({ ...prev, marketApr: v }))
  }, [])

  const setNewDepositAmount = useCallback((v: string | undefined) => {
    setInputs(prev => ({ ...prev, newDepositAmount: v }))
  }, [])

  const setStrategy = useCallback((v: OptimizerStrategy) => {
    setInputs(prev => ({ ...prev, strategy: v }))
  }, [])

  const setDerived = useCallback((next: SupplyAprOptimizerDerived) => {
    setDerivedState(next)
  }, [])

  const beginRun = useCallback((meta?: { timestamp?: bigint }) => {
    const nextRunId = Date.now()
    // Important: keep the ref in sync immediately, because consumers may call
    // finishRun in the same commit (e.g. if reads are served from cache).
    runIdRef.current = nextRunId
    setRun({ isRunning: true, runId: nextRunId, error: undefined, timestamp: meta?.timestamp })
    return nextRunId
  }, [])

  const cancelRun = useCallback((runId: number) => {
    if (runIdRef.current !== runId)
      return
    setRun((prev) => {
      if (prev.runId !== runId)
        return prev
      return { ...prev, isRunning: false, error: undefined }
    })
  }, [])

  const finishRun = useCallback((runId: number, res?: OptimizeSupplyWithPositionsResult, err?: string) => {
    if (runIdRef.current !== runId)
      return // stale (cleared or new run started)
    setRun((prev) => {
      if (prev.runId !== runId)
        return prev // stale
      return { ...prev, isRunning: false, error: err }
    })
    if (res) {
      setResult(res)
    }
  }, [])

  const applyPrefetchedResult = useCallback((res: OptimizeSupplyWithPositionsResult) => {
    setRun(prev => ({ ...prev, isRunning: false, error: undefined }))
    setResult(res)
  }, [])

  const value = useMemo<SupplyAprOptimizerContextValue>(() => {
    return {
      selection,
      inputs,
      derived,
      run,
      result,
      clear,
      setSelection,
      setMarketApr,
      setNewDepositAmount,
      setStrategy,
      setDerived,
      beginRun,
      cancelRun,
      finishRun,
      applyPrefetchedResult,
    }
  }, [selection, inputs, derived, run, result, clear, setSelection, setMarketApr, setNewDepositAmount, setStrategy, setDerived, beginRun, cancelRun, finishRun, applyPrefetchedResult])

  return (
    <SupplyAprOptimizerContext.Provider value={value}>
      {children}
    </SupplyAprOptimizerContext.Provider>
  )
}

export function useSupplyAprOptimizer() {
  const ctx = useContext(SupplyAprOptimizerContext)
  if (!ctx)
    throw new Error('useSupplyAprOptimizer must be used within SupplyAprOptimizerProvider')
  return ctx
}
