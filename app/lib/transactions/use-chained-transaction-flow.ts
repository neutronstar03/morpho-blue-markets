'use client'

import type {
  BeginTransactionFlowInput,
  ScopedTransactionUpdate,
  TransactionSuccessPayload,
} from '~/lib/contexts/transaction-feedback.types'
import { useCallback } from 'react'
import { usePublicClient } from 'wagmi'
import { useTransactionFeedback } from '~/lib/contexts/transaction-feedback.context'

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error) {
    const maybeShortMessage = 'shortMessage' in error ? error.shortMessage : undefined
    if (typeof maybeShortMessage === 'string' && maybeShortMessage)
      return maybeShortMessage

    const maybeMessage = 'message' in error ? error.message : undefined
    if (typeof maybeMessage === 'string' && maybeMessage)
      return maybeMessage
  }
  return fallback
}

function isConfirmationTimeout(error: unknown) {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('timed out') || message.includes('timeout')
}

export function isConfirmationDelayedError(error: unknown) {
  return typeof error === 'object' && !!error && 'name' in error && error.name === 'ConfirmationDelayedError'
}

export async function waitForTruthy<T>(
  read: () => T | null | undefined | false,
  {
    timeoutMs = 15_000,
    intervalMs = 100,
    errorMessage = 'Timed out waiting for transaction state',
  }: {
    timeoutMs?: number
    intervalMs?: number
    errorMessage?: string
  } = {},
): Promise<T> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const value = read()
    if (value)
      return value
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(errorMessage)
}

export function useChainedTransactionFlow() {
  const publicClient = usePublicClient()
  const {
    beginFlow,
    completeFlow,
    failFlow,
    warnFlow,
    setStatus,
    setStepStatus,
    setTxHash,
  } = useTransactionFeedback()

  const startFlow = useCallback((input: BeginTransactionFlowInput) => {
    return beginFlow(input)
  }, [beginFlow])

  const activateStep = useCallback((scope: ScopedTransactionUpdate, stepKey: string, summary: string, status: 'awaiting_wallet' | 'signing' | 'confirming' = 'awaiting_wallet') => {
    setStepStatus(scope, stepKey, 'active')
    setStatus(scope, status, summary)
  }, [setStatus, setStepStatus])

  const markStepCompleted = useCallback((scope: ScopedTransactionUpdate, stepKey: string) => {
    setStepStatus(scope, stepKey, 'completed')
  }, [setStepStatus])

  const runSignatureStep = useCallback(async <T>({
    scope,
    stepKey,
    waitingSummary,
    run,
    fallbackError,
  }: {
    scope: ScopedTransactionUpdate
    stepKey: string
    waitingSummary: string
    run: () => Promise<T>
    fallbackError: string
  }) => {
    activateStep(scope, stepKey, waitingSummary, 'signing')
    try {
      const value = await run()
      markStepCompleted(scope, stepKey)
      return value
    }
    catch (error) {
      const message = getErrorMessage(error, fallbackError)
      failFlow(scope, message)
      throw new Error(message)
    }
  }, [activateStep, failFlow, markStepCompleted])

  const runTransactionStep = useCallback(async ({
    scope,
    walletStepKey,
    confirmStepKey,
    chainId,
    walletSummary,
    confirmSummary,
    run,
    fallbackError,
  }: {
    scope: ScopedTransactionUpdate
    walletStepKey: string
    confirmStepKey: string
    chainId?: number
    walletSummary: string
    confirmSummary: string
    run: () => Promise<`0x${string}`>
    fallbackError: string
  }) => {
    if (!publicClient)
      throw new Error('Public client is not ready')

    activateStep(scope, walletStepKey, walletSummary, 'awaiting_wallet')

    try {
      const txHash = await run()
      setTxHash(scope, txHash, chainId)
      markStepCompleted(scope, walletStepKey)
      activateStep(scope, confirmStepKey, confirmSummary, 'confirming')
      await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 })
      markStepCompleted(scope, confirmStepKey)
      return txHash
    }
    catch (error) {
      if (isConfirmationTimeout(error)) {
        warnFlow(
          scope,
          'Still pending. Speed up in wallet or view in explorer.',
          'Confirmation delayed',
        )
        const delayedError = new Error('Confirmation delayed')
        delayedError.name = 'ConfirmationDelayedError'
        throw delayedError
      }
      const message = getErrorMessage(error, fallbackError)
      failFlow(scope, message)
      throw new Error(message)
    }
  }, [activateStep, failFlow, markStepCompleted, publicClient, setTxHash, warnFlow])

  const finishFlow = useCallback((scope: ScopedTransactionUpdate, payload: TransactionSuccessPayload) => {
    completeFlow(scope, payload)
  }, [completeFlow])

  return {
    startFlow,
    activateStep,
    markStepCompleted,
    runSignatureStep,
    runTransactionStep,
    finishFlow,
    failFlow,
    getErrorMessage,
  }
}
