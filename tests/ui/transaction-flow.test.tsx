import type { TransactionFlowHandle, TransactionFlowState } from '../../app/lib/contexts/transaction-feedback.types'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionFeedbackProvider, useTransactionFeedback } from '../../app/lib/contexts/transaction-feedback.context'
import { isConfirmationDelayedError, useChainedTransactionFlow } from '../../app/lib/transactions/use-chained-transaction-flow'

const waitForTransactionReceipt = vi.hoisted(() => vi.fn())

vi.mock('@wagmi/core', () => ({
  waitForTransactionReceipt,
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ chainId: 1 }),
  useConfig: () => ({}),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
}))

const KNOWN_HASH = `0x${'a'.repeat(64)}` as `0x${string}`

let hook: ReturnType<typeof useChainedTransactionFlow>
let flowState: TransactionFlowState | null

function Harness() {
  hook = useChainedTransactionFlow()
  flowState = useTransactionFeedback().flow
  return null
}

function renderHarness() {
  return render(
    <TransactionFeedbackProvider>
      <Harness />
    </TransactionFeedbackProvider>,
  )
}

function beginFlow() {
  let handle: TransactionFlowHandle | undefined
  act(() => {
    handle = hook.startFlow({
      kind: 'deposit',
      title: 'Supply USDC',
      chainId: 1,
      steps: [
        { key: 'submit', label: 'Submit transaction' },
        { key: 'confirm', label: 'Confirm onchain' },
      ],
    })
  })
  return handle!
}

async function runStep(handle: TransactionFlowHandle, run: () => Promise<`0x${string}`>) {
  let caught: unknown
  await act(async () => {
    try {
      await hook.runTransactionStep({
        scope: handle,
        walletStepKey: 'submit',
        confirmStepKey: 'confirm',
        chainId: 1,
        walletSummary: 'Confirm in wallet',
        confirmSummary: 'Confirming onchain',
        run,
        fallbackError: 'Transaction failed',
      })
    }
    catch (error) {
      caught = error
    }
  })
  return caught
}

beforeEach(() => {
  waitForTransactionReceipt.mockReset()
})

describe('chained transaction flow: submission vs receipt', () => {
  it('fails the flow on a submission timeout without a hash and never waits for a receipt', async () => {
    renderHarness()
    const handle = beginFlow()

    const submissionError = Object.assign(new Error('Request timed out'), {
      name: 'UserRejectedRequestError',
      shortMessage: 'Request timed out',
    })
    const caught = await runStep(handle, async () => {
      throw submissionError
    })

    expect(isConfirmationDelayedError(caught)).toBe(false)
    expect((caught as Error).message).toBe('Request timed out')
    expect(waitForTransactionReceipt).not.toHaveBeenCalled()
    expect(flowState?.status).toBe('error')
    expect(flowState?.txHash).toBeUndefined()
    expect(flowState?.errorMessage).toBe('Request timed out')
  })

  it('warns with the delayed-confirmation contract only for a known-hash receipt timeout', async () => {
    renderHarness()
    const handle = beginFlow()

    const timeoutError = Object.assign(new Error('Timed out while waiting for transaction to be confirmed.'), {
      name: 'WaitForTransactionReceiptTimeoutError',
    })
    waitForTransactionReceipt.mockRejectedValue(timeoutError)

    const caught = await runStep(handle, async () => KNOWN_HASH)

    expect(isConfirmationDelayedError(caught)).toBe(true)
    expect((caught as Error).name).toBe('ConfirmationDelayedError')
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(1)
    expect(waitForTransactionReceipt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeout: 180_000 }))
    expect(flowState?.status).toBe('warning')
    expect(flowState?.txHash).toBe(KNOWN_HASH)
    expect(flowState?.summary).toBe('Confirmation delayed')
    expect(flowState?.errorMessage).toBe('Still pending. Speed up in wallet or view in explorer.')
  })

  it('fails the flow on a reverted receipt even though the hash is known', async () => {
    renderHarness()
    const handle = beginFlow()

    waitForTransactionReceipt.mockRejectedValue(new Error('Execution reverted: insufficient balance'))

    const caught = await runStep(handle, async () => KNOWN_HASH)

    expect(isConfirmationDelayedError(caught)).toBe(false)
    expect((caught as Error).message).toBe('Execution reverted: insufficient balance')
    expect(flowState?.status).toBe('error')
    expect(flowState?.txHash).toBe(KNOWN_HASH)
    expect(flowState?.errorMessage).toBe('Execution reverted: insufficient balance')
  })

  it('completes both steps and returns the hash on a successful receipt', async () => {
    renderHarness()
    const handle = beginFlow()

    waitForTransactionReceipt.mockResolvedValue({
      transactionHash: KNOWN_HASH,
      status: 'success',
    })

    let returned: `0x${string}` | undefined
    await act(async () => {
      returned = await hook.runTransactionStep({
        scope: handle,
        walletStepKey: 'submit',
        confirmStepKey: 'confirm',
        chainId: 1,
        walletSummary: 'Confirm in wallet',
        confirmSummary: 'Confirming onchain',
        run: async () => KNOWN_HASH,
        fallbackError: 'Transaction failed',
      })
    })

    expect(returned).toBe(KNOWN_HASH)
    expect(flowState?.txHash).toBe(KNOWN_HASH)
    expect(flowState?.steps.find(step => step.key === 'submit')?.status).toBe('completed')
    expect(flowState?.steps.find(step => step.key === 'confirm')?.status).toBe('completed')

    act(() => {
      hook.finishFlow(handle, { title: 'Supply USDC', txHash: KNOWN_HASH, chainId: 1 })
    })
    expect(flowState?.status).toBe('success')
  })

  it('keeps a revert mentioning timeout as an error rather than pending confirmation', async () => {
    renderHarness()
    const handle = beginFlow()
    waitForTransactionReceipt.mockRejectedValue(new Error('Execution reverted: request timed out'))
    const caught = await runStep(handle, async () => KNOWN_HASH)
    expect(isConfirmationDelayedError(caught)).toBe(false)
    expect(flowState?.status).toBe('error')
    expect(flowState?.txHash).toBe(KNOWN_HASH)
  })
})
