import type { ReactNode } from 'react'
import type { OptimizeSupplyRebalanceOnlyResult, UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export interface SupplyApyOptimizerSelection {
  chainId?: number
  loanAssetAddress?: string
  loanAssetSymbol?: string
  loanAssetDecimals?: number
}

export interface SupplyApyOptimizerInputs {
  /** Human input in token units (e.g. "123.45"). Parsed later using decimals. */
  minMoveSize?: string
}

export interface SupplyApyOptimizerDerived {
  /** Total currently supplied for the selected loan asset (raw units). */
  totalSuppliedAssets?: bigint
  /** Positions for selected loan asset (raw units). */
  positions?: UserSupplyPosition[]
}

export interface SupplyApyOptimizerRunState {
  isRunning: boolean
  runId: number
  error?: string
  timestamp?: bigint
}

export interface SupplyApyOptimizerState {
  started: boolean
  selection: SupplyApyOptimizerSelection
  inputs: SupplyApyOptimizerInputs
  derived: SupplyApyOptimizerDerived
  run: SupplyApyOptimizerRunState
  result?: OptimizeSupplyRebalanceOnlyResult
}

interface SupplyApyOptimizerContextValue extends SupplyApyOptimizerState {
  start: () => void
  clear: () => void
  setSelection: (next: SupplyApyOptimizerSelection) => void
  setMinMoveSize: (v: string) => void
  setDerived: (next: SupplyApyOptimizerDerived) => void
  beginRun: (meta?: { timestamp?: bigint }) => number
  finishRun: (runId: number, res?: OptimizeSupplyRebalanceOnlyResult, err?: string) => void
}

const SupplyApyOptimizerContext = createContext<SupplyApyOptimizerContextValue | null>(null)

export function SupplyApyOptimizerProvider({ children }: { children: ReactNode }) {
  const [started, setStarted] = useState(false)
  const [selection, setSelectionState] = useState<SupplyApyOptimizerSelection>({})
  const [inputs, setInputs] = useState<SupplyApyOptimizerInputs>({})
  const [derived, setDerivedState] = useState<SupplyApyOptimizerDerived>({})
  const [run, setRun] = useState<SupplyApyOptimizerRunState>({ isRunning: false, runId: 0 })
  const [result, setResult] = useState<OptimizeSupplyRebalanceOnlyResult | undefined>(undefined)
  const runIdRef = useRef<number>(0)

  const start = useCallback(() => setStarted(true), [])

  const clear = useCallback(() => {
    setStarted(false)
    setSelectionState({})
    setInputs({})
    setDerivedState({})
    setRun((prev) => {
      const nextRunId = prev.runId + 1
      runIdRef.current = nextRunId
      return { isRunning: false, runId: nextRunId }
    })
    setResult(undefined)
  }, [])

  const setSelection = useCallback((next: SupplyApyOptimizerSelection) => {
    setSelectionState(next)
    // Reset derived + result when changing selection
    setDerivedState({})
    setResult(undefined)
    setRun(prev => ({ ...prev, error: undefined }))
  }, [])

  const setMinMoveSize = useCallback((v: string) => {
    setInputs(prev => ({ ...prev, minMoveSize: v }))
  }, [])

  const setDerived = useCallback((next: SupplyApyOptimizerDerived) => {
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

  const finishRun = useCallback((runId: number, res?: OptimizeSupplyRebalanceOnlyResult, err?: string) => {
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

  const value = useMemo<SupplyApyOptimizerContextValue>(() => {
    return {
      started,
      selection,
      inputs,
      derived,
      run,
      result,
      start,
      clear,
      setSelection,
      setMinMoveSize,
      setDerived,
      beginRun,
      finishRun,
    }
  }, [started, selection, inputs, derived, run, result, start, clear, setSelection, setMinMoveSize, setDerived, beginRun, finishRun])

  return (
    <SupplyApyOptimizerContext.Provider value={value}>
      {children}
    </SupplyApyOptimizerContext.Provider>
  )
}

export function useSupplyApyOptimizer() {
  const ctx = useContext(SupplyApyOptimizerContext)
  if (!ctx)
    throw new Error('useSupplyApyOptimizer must be used within SupplyApyOptimizerProvider')
  return ctx
}
