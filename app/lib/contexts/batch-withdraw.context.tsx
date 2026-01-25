import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export interface BatchWithdrawSelection {
  chainId?: number
  loanAssetAddress?: string
}

export interface BatchWithdrawInputs {
  /** Human input in token units (e.g. "123.45"). Parsed later using decimals. */
  withdrawAmount?: string
}

export interface BatchWithdrawState {
  selection: BatchWithdrawSelection
  inputs: BatchWithdrawInputs
}

interface BatchWithdrawContextValue extends BatchWithdrawState {
  setSelection: (next: BatchWithdrawSelection) => void
  setWithdrawAmount: (v: string | undefined) => void
  clear: () => void
}

const BatchWithdrawContext = createContext<BatchWithdrawContextValue | null>(null)

export function BatchWithdrawProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<BatchWithdrawSelection>({})
  const [inputs, setInputsState] = useState<BatchWithdrawInputs>({})

  // Used to ignore stale clears if we ever add async effects.
  const clearNonceRef = useRef(0)

  const setSelection = useCallback((next: BatchWithdrawSelection) => {
    setSelectionState(next)
  }, [])

  const setWithdrawAmount = useCallback((v: string | undefined) => {
    setInputsState(prev => ({ ...prev, withdrawAmount: v }))
  }, [])

  const clear = useCallback(() => {
    clearNonceRef.current += 1
    setSelectionState({})
    setInputsState({})
  }, [])

  const value = useMemo<BatchWithdrawContextValue>(() => {
    return {
      selection,
      inputs,
      setSelection,
      setWithdrawAmount,
      clear,
    }
  }, [clear, inputs, selection, setSelection, setWithdrawAmount])

  return (
    <BatchWithdrawContext.Provider value={value}>
      {children}
    </BatchWithdrawContext.Provider>
  )
}

export function useBatchWithdraw() {
  const ctx = useContext(BatchWithdrawContext)
  if (!ctx)
    throw new Error('useBatchWithdraw must be used within BatchWithdrawProvider')
  return ctx
}
