import type { ReactNode } from 'react'
import type { BatchWithdrawPlanState } from '~/pages/home/batch-withdraw/shared'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionSuccessModal } from '~/components/transaction/transaction-success-modal'
import { TransactionFeedbackProvider, useTransactionFeedback } from '~/lib/contexts/transaction-feedback.context'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { BatchWithdrawForm } from '~/pages/home/batch-withdraw/form'
import { SupplyAprOptimizerForm } from '~/pages/home/supply-apr-optimizer/optimizer-form'
import HomePage from '~/routes/home'

const analyticsMocks = vi.hoisted(() => ({ trackEvent: vi.fn() }))

vi.mock('~/lib/analytics', () => ({
  trackEvent: analyticsMocks.trackEvent,
  trackPageview: vi.fn(),
  initClickTracking: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useAccount: () => ({ chain: { id: 1 } }),
}))

vi.mock('~/lib/contexts/network', () => ({
  useNetworkContext: () => ({ setRequiredChainId: vi.fn(), requiredChainId: undefined }),
}))

vi.mock('~/components/header', () => ({
  Header: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
}))

vi.mock('~/lib/explorer', () => ({
  getExplorerTransactionUrl: () => 'https://example.test/tx/abc',
  getExplorerUrl: () => '',
}))

vi.mock('~/pages/home/position', () => ({ Position: () => null }))
vi.mock('~/pages/home/batch-withdraw', () => ({ BatchWithdraw: () => null }))
vi.mock('~/pages/home/supply-apr-optimizer', () => ({ SupplyAprOptimizer: () => null }))
vi.mock('~/pages/home/advanced-list', () => ({ AdvancedList: () => null }))
vi.mock('~/pages/home/advanced-settings', () => ({ AdvancedSettings: () => null }))
vi.mock('~/pages/home/blacklist-recap', () => ({ BlacklistRecap: () => null }))

const OPEN_OPTIMIZER_EVENT = 'open-supply-apr-optimizer'
const TX_HASH = (`0x${'a'.repeat(64)}`) as `0x${string}`

function seedOpportunity() {
  useHomeMagicOptimizerStore.setState({
    opportunities: [
      {
        id: 'opp-usdc',
        chainId: 1,
        loanAssetAddress: '0x0000000000000000000000000000000000000001',
        loanAssetSymbol: 'USDC',
        loanAssetDecimals: 6,
        currentAprPct: 5,
        optimizedAprPct: 8,
        aprGainWad: 30_000_000_000_000_000n,
        aprGainPct: 3,
        relativeImprovementPct: 4.5,
        yearlyReturnGainUsd: 365,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      },
    ],
  })
}

beforeEach(() => {
  analyticsMocks.trackEvent.mockReset()
  window.localStorage.clear()
  useHomeMagicOptimizerStore.setState({ opportunities: [], optimizerPreset: undefined })
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0)) as unknown as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as unknown as typeof window.cancelAnimationFrame
})

afterEach(() => {
  useHomeMagicOptimizerStore.setState({ opportunities: [], optimizerPreset: undefined })
  window.localStorage.clear()
})

describe('home opportunity card accessibility', () => {
  it('exposes the opportunity as a semantic action button with a sibling dismiss button', () => {
    seedOpportunity()
    render(<HomePage />)

    const action = screen.getByRole('button', { name: 'Optimize USDC opportunity' })
    const dismiss = screen.getByRole('button', { name: 'Dismiss USDC opportunity' })

    expect(action.tagName).toBe('BUTTON')
    expect(action).toHaveAttribute('type', 'button')
    expect(dismiss.tagName).toBe('BUTTON')
    expect(action.contains(dismiss)).toBe(false)
    expect(action.parentElement).toBe(dismiss.parentElement)
    expect(document.querySelectorAll('button button')).toHaveLength(0)
  })

  it('runs the optimizer from the keyboard-focusable action control', () => {
    const openListener = vi.fn()
    window.addEventListener(OPEN_OPTIMIZER_EVENT, openListener)
    seedOpportunity()
    render(<HomePage />)

    const action = screen.getByRole('button', { name: 'Optimize USDC opportunity' })
    action.focus()
    expect(action).toHaveFocus()

    // A native button turns Enter/Space into a click in the browser; jsdom does not
    // synthesize that default action, so emit the activation a keyboard would produce.
    fireEvent.click(action)

    expect(openListener).toHaveBeenCalledTimes(1)
    expect(analyticsMocks.trackEvent).toHaveBeenCalledWith('opportunity_card_clicked', expect.objectContaining({ loanAsset: 'USDC', chainId: 1 }))
    window.removeEventListener(OPEN_OPTIMIZER_EVENT, openListener)
  })

  it('dismisses without opening the optimizer and reports the dismissal separately', () => {
    const openListener = vi.fn()
    window.addEventListener(OPEN_OPTIMIZER_EVENT, openListener)
    seedOpportunity()
    render(<HomePage />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss USDC opportunity' }))

    expect(openListener).not.toHaveBeenCalled()
    expect(analyticsMocks.trackEvent).toHaveBeenCalledWith('opportunity_card_dismissed', expect.objectContaining({ loanAsset: 'USDC', chainId: 1 }))
    expect(useHomeMagicOptimizerStore.getState().opportunities).toHaveLength(0)
    window.removeEventListener(OPEN_OPTIMIZER_EVENT, openListener)
  })
})

const emptyPlan: BatchWithdrawPlanState = {
  ok: false,
  error: undefined,
  items: [],
  remaining: 0n,
  overWithdrawAssets: 0n,
  totalSupplied: 0n,
  totalWithdrawable: 0n,
}

describe('form label associations', () => {
  it('associates the optimizer supply, market APR and max markets labels with their controls', () => {
    render(
      <SupplyAprOptimizerForm
        onChangeLoanAsset={vi.fn()}
        ownedLoanAssetOptions={[]}
        popularLoanAssetOptions={[]}
        loanAssetOptions={[{ address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 }]}
        totalSuppliedAssets={0n}
        defaultMarketApr="10"
        onChangeMarketApr={vi.fn()}
        onChangeNewDepositAmount={vi.fn()}
        onFillMaxDeposit={vi.fn()}
        onFillZeroDeposit={vi.fn()}
        optimizerChainOptions={[{ chainId: 1, name: 'Ethereum' }]}
        onChangeOptimizerChain={vi.fn()}
        symbol="USDC"
        maxMarketsInput="6"
        setMaxMarketsInput={vi.fn()}
        parseMaxMarkets={(value: string) => Number(value) || 1}
        strategy="maxYield"
        onChangeStrategy={vi.fn()}
        onOptimize={vi.fn()}
        optimizeDisabled={false}
        optimizeLoading={false}
        optimizeLabel="Optimize"
      />,
    )

    const deposit = screen.getByLabelText('Additional amount to supply')
    expect(deposit.tagName).toBe('INPUT')
    expect(deposit.id).toBeTruthy()

    const marketApr = screen.getByLabelText('Market APR')
    expect(marketApr.tagName).toBe('INPUT')
    expect(marketApr.id).toBeTruthy()

    const maxMarkets = screen.getByLabelText('Max markets')
    expect(maxMarkets.tagName).toBe('INPUT')
    expect(maxMarkets.id).toBeTruthy()
  })

  it('keeps the batch withdraw amount label associated with its input', () => {
    render(
      <BatchWithdrawForm
        isLoadingPositions={false}
        chainOptions={[{ chainId: 1, name: 'Ethereum' }]}
        loanAssetOptions={[{ address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 }]}
        selectedLoanAssetAddress="0x0000000000000000000000000000000000000001"
        selectedOption={{ address: '0x0000000000000000000000000000000000000001', symbol: 'USDC', decimals: 6 }}
        withdrawAmount="1"
        symbol="USDC"
        plan={emptyPlan}
        computedMarketsOk
        onChangeChain={vi.fn()}
        onChangeLoanAsset={vi.fn()}
        onChangeWithdrawAmount={vi.fn()}
      />,
    )

    const amount = screen.getByLabelText('Amount')
    expect(amount).toHaveAttribute('id', 'batch-withdraw-amount')
  })
})

function ModalHarness() {
  const { beginFlow, completeFlow, flow } = useTransactionFeedback()
  const handleRef = useRef<{ flowId: string, attemptId: string } | null>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const handle = beginFlow({ kind: 'deposit', title: 'Supply USDC' })
          handleRef.current = handle
          completeFlow(handle, {
            title: 'Supply USDC',
            summary: 'Your supply was successful',
            txHash: TX_HASH,
            chainId: 1,
            facts: [{ label: 'Amount', value: '10 USDC' }],
          })
        }}
      >
        Open success modal
      </button>
      <div data-testid="flow-status">{flow ? flow.status : 'none'}</div>
      <TransactionSuccessModal />
    </>
  )
}

function renderModal() {
  return render(
    <TransactionFeedbackProvider>
      <ModalHarness />
    </TransactionFeedbackProvider>,
  )
}

describe('transaction success modal accessibility', () => {
  it('exposes an accessible name and description and moves focus inside the dialog', async () => {
    renderModal()
    const trigger = screen.getByRole('button', { name: 'Open success modal' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Supply USDC' })
    expect(screen.getByRole('dialog', { description: 'Your supply was successful' })).toBe(dialog)
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.querySelectorAll('[data-radix-focus-guard]').length).toBeGreaterThan(0)
  })

  it('closes the flow on Escape and returns focus to the opener', async () => {
    renderModal()
    const trigger = screen.getByRole('button', { name: 'Open success modal' })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Supply USDC' })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('flow-status')).toHaveTextContent('none')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('closes the flow from the Close button with the same behavior as Escape', async () => {
    renderModal()
    const trigger = screen.getByRole('button', { name: 'Open success modal' })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Supply USDC' })

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByTestId('flow-status')).toHaveTextContent('none')
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
