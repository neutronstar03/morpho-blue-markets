'use client'

import type {
  BeginTransactionFlowInput,
  ScopedTransactionUpdate,
  TransactionSuccessPayload,
} from '~/lib/contexts/transaction-feedback.types'
import { waitForTransactionReceipt } from '@wagmi/core'
import { useCallback } from 'react'
import { BaseError } from 'viem'
import { useAccount, useConfig, useSwitchChain } from 'wagmi'
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

function isTimeoutError(error: unknown) {
  return typeof error === 'object' && !!error && 'name' in error
    && (error.name === 'WaitForTransactionReceiptTimeoutError' || error.name === 'TimeoutError')
}

function isConfirmationTimeout(error: unknown) {
  // A revert reason can itself contain "timeout"; only typed timeout errors
  // (including a viem cause) mean confirmation could still be pending.
  return isTimeoutError(error instanceof BaseError ? error.walk(isTimeoutError) : error)
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
  const config = useConfig()
  const { chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
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

  const runSwitchChainStep = useCallback(async ({
    scope,
    stepKey,
    chainId,
    chainName,
  }: {
    scope: ScopedTransactionUpdate
    stepKey: string
    chainId: number
    chainName?: string
  }) => {
    if (walletChainId === chainId) {
      markStepCompleted(scope, stepKey)
      return
    }

    const label = chainName ?? `Chain ${chainId}`
    activateStep(scope, stepKey, `Switch wallet to ${label}`, 'awaiting_wallet')

    try {
      await switchChainAsync({ chainId })
      markStepCompleted(scope, stepKey)
    }
    catch (error) {
      const message = getErrorMessage(error, `Switch to ${label} failed`)
      failFlow(scope, message)
      throw new Error(message)
    }
  }, [activateStep, failFlow, markStepCompleted, switchChainAsync, walletChainId])

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
    activateStep(scope, walletStepKey, walletSummary, 'awaiting_wallet')

    // Submission stage: the wallet write. A failure here means no transaction
    // hash exists yet, so it is always a hard failure and can never be reported
    // as a delayed confirmation.
    let txHash: `0x${string}`
    try {
      txHash = await run()
    }
    catch (error) {
      const message = getErrorMessage(error, fallbackError)
      failFlow(scope, message)
      throw new Error(message)
    }

    setTxHash(scope, txHash, chainId)
    markStepCompleted(scope, walletStepKey)

    // Confirmation stage: we hold a known hash, so a receipt-wait timeout can be
    // surfaced as a delayed confirmation instead of a hard failure. Reverted or
    // otherwise failed receipts still fail the flow.
    activateStep(scope, confirmStepKey, confirmSummary, 'confirming')
    try {
      await waitForTransactionReceipt(config, { hash: txHash, chainId, confirmations: 1, timeout: 180_000 })
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

    markStepCompleted(scope, confirmStepKey)
    return txHash
  }, [activateStep, config, failFlow, markStepCompleted, setTxHash, warnFlow])

  const finishFlow = useCallback((scope: ScopedTransactionUpdate, payload: TransactionSuccessPayload) => {
    completeFlow(scope, payload)
  }, [completeFlow])

  return {
    startFlow,
    activateStep,
    markStepCompleted,
    runSwitchChainStep,
    runSignatureStep,
    runTransactionStep,
    finishFlow,
    failFlow,
    getErrorMessage,
  }
}
