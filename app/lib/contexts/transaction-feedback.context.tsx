'use client'

import type { ReactNode } from 'react'
import type {
  BeginTransactionFlowInput,
  ScopedTransactionUpdate,
  TransactionFlowHandle,
  TransactionFlowState,
  TransactionFlowStatus,
  TransactionStepStatus,
  TransactionSuccessPayload,
} from './transaction-feedback.types'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface TransactionFeedbackContextValue {
  flow: TransactionFlowState | null
  isSuccessModalOpen: boolean
  beginFlow: (input: BeginTransactionFlowInput) => TransactionFlowHandle
  updateFlow: (scope: ScopedTransactionUpdate, patch: Partial<Omit<TransactionFlowState, 'id' | 'activeAttemptId' | 'kind' | 'steps'>>) => void
  setStepStatus: (scope: ScopedTransactionUpdate, stepKey: string, status: TransactionStepStatus, nextLabel?: string) => void
  setStatus: (scope: ScopedTransactionUpdate, status: TransactionFlowStatus, summary?: string) => void
  setTxHash: (scope: ScopedTransactionUpdate, txHash: `0x${string}` | undefined, chainId?: number) => void
  completeFlow: (scope: ScopedTransactionUpdate, payload: TransactionSuccessPayload) => void
  failFlow: (scope: ScopedTransactionUpdate, message: string) => void
  dismissSuccessModal: () => void
  clearFlow: (flowId?: string) => void
}

const TransactionFeedbackContext = createContext<TransactionFeedbackContextValue | null>(null)

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function matchesScope(current: TransactionFlowState | null, scope: ScopedTransactionUpdate) {
  return !!current && current.id === scope.flowId && current.activeAttemptId === scope.attemptId
}

export function TransactionFeedbackProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<TransactionFlowState | null>(null)
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false)

  const beginFlow = useCallback((input: BeginTransactionFlowInput): TransactionFlowHandle => {
    const flowId = makeId()
    const attemptId = makeId()
    setIsSuccessModalOpen(false)
    setFlow({
      id: flowId,
      activeAttemptId: attemptId,
      kind: input.kind,
      status: 'awaiting_wallet',
      title: input.title,
      summary: input.summary,
      chainId: input.chainId,
      steps: (input.steps ?? []).map((step, index) => ({
        ...step,
        status: index === 0 ? 'active' : 'pending',
      })),
    })
    return { flowId, attemptId }
  }, [])

  const updateFlow = useCallback((scope: ScopedTransactionUpdate, patch: Partial<Omit<TransactionFlowState, 'id' | 'activeAttemptId' | 'kind' | 'steps'>>) => {
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      return {
        ...current,
        ...patch,
      }
    })
  }, [])

  const setStepStatus = useCallback((scope: ScopedTransactionUpdate, stepKey: string, status: TransactionStepStatus, nextLabel?: string) => {
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      return {
        ...current,
        steps: current.steps.map(step => ({
          ...step,
          label: step.key === stepKey && nextLabel ? nextLabel : step.label,
          status: step.key === stepKey ? status : step.status,
        })),
      }
    })
  }, [])

  const setStatus = useCallback((scope: ScopedTransactionUpdate, status: TransactionFlowStatus, summary?: string) => {
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      return {
        ...current,
        status,
        summary: summary ?? current.summary,
      }
    })
  }, [])

  const setTxHash = useCallback((scope: ScopedTransactionUpdate, txHash: `0x${string}` | undefined, chainId?: number) => {
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      return {
        ...current,
        txHash,
        chainId: chainId ?? current.chainId,
      }
    })
  }, [])

  const completeFlow = useCallback((scope: ScopedTransactionUpdate, payload: TransactionSuccessPayload) => {
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      return {
        ...current,
        status: 'success',
        txHash: payload.txHash ?? current.txHash,
        chainId: payload.chainId ?? current.chainId,
        steps: current.steps.map(step => ({
          ...step,
          status: step.status === 'error' ? step.status : 'completed',
        })),
        success: payload,
      }
    })
    setIsSuccessModalOpen(payload.showModal !== false)
  }, [])

  const failFlow = useCallback((scope: ScopedTransactionUpdate, message: string) => {
    setIsSuccessModalOpen(false)
    setFlow((current) => {
      if (!current || !matchesScope(current, scope))
        return current
      const hasActive = current.steps.some(step => step.status === 'active')
      return {
        ...current,
        status: 'error',
        errorMessage: message,
        steps: current.steps.map((step, index) => {
          if (step.status === 'active')
            return { ...step, status: 'error' }
          if (!hasActive && index === current.steps.length - 1)
            return { ...step, status: 'error' }
          return step
        }),
      }
    })
  }, [])

  const dismissSuccessModal = useCallback(() => {
    setIsSuccessModalOpen(false)
  }, [])

  const clearFlow = useCallback((flowId?: string) => {
    setIsSuccessModalOpen(false)
    setFlow((current) => {
      if (!current)
        return current
      if (flowId && current.id !== flowId)
        return current
      return null
    })
  }, [])

  const value = useMemo<TransactionFeedbackContextValue>(() => ({
    flow,
    isSuccessModalOpen,
    beginFlow,
    updateFlow,
    setStepStatus,
    setStatus,
    setTxHash,
    completeFlow,
    failFlow,
    dismissSuccessModal,
    clearFlow,
  }), [beginFlow, clearFlow, completeFlow, dismissSuccessModal, failFlow, flow, isSuccessModalOpen, setStatus, setStepStatus, setTxHash, updateFlow])

  return <TransactionFeedbackContext.Provider value={value}>{children}</TransactionFeedbackContext.Provider>
}

export function useTransactionFeedback() {
  const context = useContext(TransactionFeedbackContext)
  if (!context)
    throw new Error('useTransactionFeedback must be used within TransactionFeedbackProvider')
  return context
}
