import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useDebugValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { AmountControl } from '~/components/ui/amount-control'
import { MarketAprPreview } from '~/components/ui/market-apr-preview'
import { formatBigintShort, formatDecimalStringShort } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket, useSupply, useTokenApproval, useTokenBalance } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useChainedTransactionFlow, waitForTruthy } from '~/lib/transactions/use-chained-transaction-flow'
import { ModeToggleSuffix } from './market-action-form/mode-toggle-suffix'
import { InlineNotice } from './market-action-form/status-message'
import { SubmitButton } from './market-action-form/submit-button'

interface DepositFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  prefill?: { mode: 'asset', amount: string, key: string }
  onSuccess?: () => void
}

const isValidNumberInput = (value: string) => value === '' || /^\d*(?:\.\d*)?$/.test(value)

function useDepositFormState() {
  const isClient = useIsClient()
  const [mode, setMode] = useLocalStorage<'percent' | 'asset'>('market:deposit:unit', 'percent')
  const [percentage, setPercentage] = useState('')
  const [assetAmount, setAssetAmount] = useState('')

  useDebugValue({ mode, percentage, assetAmount, isClient })

  return {
    isClient,
    mode,
    setMode,
    percentage,
    setPercentage,
    assetAmount,
    setAssetAmount,
  }
}

export function DepositForm({ market, loanTokenSymbol, prefill, onSuccess }: DepositFormProps) {
  const {
    isClient,
    mode,
    setMode,
    percentage,
    setPercentage,
    assetAmount,
    setAssetAmount,
  } = useDepositFormState()
  const { address } = useAccount()
  const [isSubmittingFlow, setIsSubmittingFlow] = useState(false)
  const { startFlow, runTransactionStep, finishFlow, failFlow: failTransactionFlow, getErrorMessage } = useChainedTransactionFlow()

  const { data: marketStateRaw } = useMarket(market.uniqueKey)

  const appliedPrefillKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!prefill)
      return
    if (appliedPrefillKeyRef.current === prefill.key)
      return

    appliedPrefillKeyRef.current = prefill.key
    if (prefill.mode === 'asset') {
      setMode('asset')
      setAssetAmount(prefill.amount)
      setPercentage('')
    }
  }, [prefill, setMode])

  // Wallet balance
  const { data: tokenBalance } = useTokenBalance(market.loanAsset.address, address)

  // Derive amount from percentage of wallet balance
  const amountWei = useMemo(() => {
    if (mode === 'percent') {
      if (!tokenBalance)
        return 0n
      const pct = Number.parseFloat(percentage)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
        return 0n
      const SCALE = 10000
      const pctScaled = BigInt(Math.round(pct * SCALE))
      return (tokenBalance * pctScaled) / (BigInt(100) * BigInt(SCALE))
    }

    if (!assetAmount || !isValidNumberInput(assetAmount))
      return 0n

    let assetsWei = 0n
    try {
      assetsWei = parseUnits(assetAmount, market.loanAsset.decimals!)
    }
    catch {
      return 0n
    }
    if (assetsWei <= 0n)
      return 0n
    // NOTE: do not cap to wallet balance — we still want to preview impact for arbitrary amounts.
    return assetsWei
  }, [mode, percentage, assetAmount, tokenBalance, market.loanAsset.decimals])

  const amount = useMemo(() => {
    if (!amountWei)
      return ''
    return formatUnits(amountWei, market.loanAsset.decimals!)
  }, [amountWei, market.loanAsset.decimals])

  const percentOfBalanceString = useMemo(() => {
    if (!tokenBalance || tokenBalance <= 0n || amountWei <= 0n)
      return '0'
    let percentHundredths = (amountWei * 10_000n) / tokenBalance
    if (percentHundredths > 10_000n)
      percentHundredths = 10_000n
    const integer = percentHundredths / 100n
    const frac = percentHundredths % 100n
    if (frac === 0n)
      return integer.toString()
    return `${integer.toString()}.${frac.toString().padStart(2, '0')}`
  }, [amountWei, tokenBalance])

  const switchToPercent = () => {
    setMode('percent')
    setPercentage(percentOfBalanceString)
  }

  const switchToAsset = () => {
    setMode('asset')
    setAssetAmount(amount || '')
  }

  const displayAmountShort = useMemo(() => {
    return amount ? formatDecimalStringShort(amount) : '0'
  }, [amount])

  const displayBalanceShort = useMemo(() => {
    return tokenBalance ? formatBigintShort(tokenBalance, market.loanAsset.decimals!) : '0'
  }, [tokenBalance, market.loanAsset.decimals])

  const [debouncedAmount] = useDebounce(amount, 500)
  const isAmountDebounced = amount === debouncedAmount

  const debouncedAmountWei = useMemo(() => {
    if (!debouncedAmount || !isValidNumberInput(debouncedAmount))
      return 0n
    try {
      return parseUnits(debouncedAmount, market.loanAsset.decimals!)
    }
    catch {
      return 0n
    }
  }, [debouncedAmount, market.loanAsset.decimals])

  const {
    needsApproval,
    isPending: isApprovingToken,
    error: approveError,
    refetch: refetchApproval,
    isSimulating: isSimulatingApproval,
    isAllowanceReady,
    approveAsync,
    approveRequest,
  } = useTokenApproval(market.loanAsset.address, debouncedAmount, address, market.loanAsset.decimals)

  const hasSufficientBalance = useMemo(() => {
    if (!tokenBalance)
      return false
    if (debouncedAmountWei <= 0n)
      return false
    return debouncedAmountWei <= tokenBalance
  }, [debouncedAmountWei, tokenBalance])

  // Gate supply simulation until allowance is known and sufficient
  // Also gate on wallet balance: preview should work for arbitrary amounts, but tx simulation will revert if balance is insufficient.
  const guardedAmount = (isAllowanceReady && !needsApproval && hasSufficientBalance) ? debouncedAmount : ''

  const {
    canSupply,
    isPending: isSupplying,
    error: supplyError,
    isSimulating: isSimulatingSupply,
    supplyAsync,
    supplyRequest,
  } = useSupply(market, guardedAmount, market.loanAsset.decimals!)

  const effectiveSupplyError = (!isAllowanceReady || needsApproval) ? undefined : supplyError

  const latestStateRef = useRef({
    needsApproval,
    canSupply,
    isAllowanceReady,
    hasSufficientBalance,
    approveRequest,
    supplyRequest,
  })

  useEffect(() => {
    latestStateRef.current = {
      needsApproval,
      canSupply,
      isAllowanceReady,
      hasSufficientBalance,
      approveRequest,
      supplyRequest,
    }
  }, [approveRequest, canSupply, hasSufficientBalance, isAllowanceReady, needsApproval, supplyRequest])

  const handleMaxClick = () => {
    if (mode === 'percent') {
      setPercentage('100')
      return
    }
    if (!tokenBalance) {
      setAssetAmount('')
      return
    }
    const max = formatUnits(tokenBalance, market.loanAsset.decimals!)
    setAssetAmount(max === '0' ? '' : max)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !address || !isClient)
      return

    const marketLabel = `${market.collateralAsset.symbol} / ${loanTokenSymbol}`
    const steps = [] as Array<{ key: string, label: string }>
    if (needsApproval) {
      steps.push({ key: 'approveWallet', label: `Confirm ${loanTokenSymbol} approval in wallet` })
      steps.push({ key: 'approveConfirm', label: 'Confirming approval onchain' })
    }
    steps.push({ key: 'depositWallet', label: 'Confirm deposit in wallet' })
    steps.push({ key: 'depositConfirm', label: 'Confirming deposit onchain' })
    const scope = startFlow({
      kind: 'deposit',
      title: `Deposit ${displayAmountShort} ${loanTokenSymbol}`,
      summary: 'Preparing guided deposit',
      steps,
    })

    try {
      setIsSubmittingFlow(true)

      if (needsApproval) {
        await runTransactionStep({
          scope,
          walletStepKey: 'approveWallet',
          confirmStepKey: 'approveConfirm',
          walletSummary: `Waiting for ${loanTokenSymbol} approval in wallet`,
          confirmSummary: 'Confirming approval onchain',
          fallbackError: 'Approval failed',
          run: approveAsync,
        })
        await refetchApproval?.()
        await waitForTruthy(() => {
          const state = latestStateRef.current
          return state.isAllowanceReady && !state.needsApproval && state.canSupply ? true : undefined
        }, {
          errorMessage: 'Approval succeeded but deposit transaction is not ready yet',
        })
      }

      if (!latestStateRef.current.hasSufficientBalance)
        throw new Error('Insufficient wallet balance for this deposit amount')

      if (!latestStateRef.current.canSupply)
        throw new Error('Deposit transaction is not ready yet')

      const txHash = await runTransactionStep({
        scope,
        walletStepKey: 'depositWallet',
        confirmStepKey: 'depositConfirm',
        walletSummary: 'Waiting for deposit confirmation in wallet',
        confirmSummary: 'Confirming deposit onchain',
        fallbackError: 'Deposit failed',
        run: supplyAsync,
      })

      finishFlow(scope, {
        title: `Deposited ${displayAmountShort} ${loanTokenSymbol}`,
        summary: `Deposit completed on ${marketLabel}.`,
        txHash,
        facts: [
          { label: 'Market', value: marketLabel },
          { label: 'Amount', value: `${displayAmountShort} ${loanTokenSymbol}` },
        ],
        showModal: true,
      })
      onSuccess?.()
    }
    catch (error) {
      const message = getErrorMessage(error, 'Deposit failed')
      failTransactionFlow(scope, message)
      console.error('Transaction failed:', error)
    }
    finally {
      setIsSubmittingFlow(false)
    }
  }

  // Input handled by AmountControl

  const isLoading = isSubmittingFlow || isSupplying || isApprovingToken || isSimulatingSupply || isSimulatingApproval || (!needsApproval && !isAllowanceReady && !!amount)
  const hasError = effectiveSupplyError || approveError

  const preview = useMarketPreview({
    market,
    marketStateRaw,
    deltaSupplyAssets: debouncedAmountWei,
  })

  const showPreview = debouncedAmountWei > 0n && preview.utilizationAfter != null
  const beforeUtil = preview.utilizationBefore ?? market.state.utilization
  const afterUtil = preview.utilizationAfter
  const beforeApr = preview.supplyAprBefore
  const afterApr = preview.supplyAprAfter
  const showAprEstimateLabel = afterApr != null
  const submitDisabled = !amount || isLoading || !address || !isAmountDebounced || (!isAllowanceReady && !!amount) || (!needsApproval && !hasSufficientBalance)
  const submitLoadingLabel = (!isAllowanceReady && !!amount)
    ? 'Checking allowance...'
    : isSimulatingApproval
      ? 'Preparing approval...'
      : isApprovingToken || isSubmittingFlow
        ? 'Approving...'
        : isSimulatingSupply
          ? 'Preparing deposit...'
          : 'Depositing...'
  const submitIdleLabel = needsApproval && hasSufficientBalance
    ? `Approve + deposit ${displayAmountShort} ${loanTokenSymbol}`
    : needsApproval
      ? `Approve ${loanTokenSymbol}`
      : `Deposit ${displayAmountShort} ${loanTokenSymbol}`

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AmountControl
        label={mode === 'percent' ? 'Percentage to Deposit' : `Amount to Deposit (${loanTokenSymbol})`}
        percentage={mode === 'percent' ? percentage : assetAmount}
        onChange={mode === 'percent' ? setPercentage : setAssetAmount}
        onMax={handleMaxClick}
        showSlider={mode === 'percent'}
        suffix={(
          <ModeToggleSuffix
            mode={mode}
            assetSymbol={loanTokenSymbol}
            onPercentClick={switchToPercent}
            onAssetClick={switchToAsset}
          />
        )}
        leftHelper={address
          ? (
              <>
                Wallet balance:
                {' '}
                <span className="text-gray-200">{displayBalanceShort}</span>
                {' '}
                {loanTokenSymbol}
              </>
            )
          : undefined}
        rightHelper={mode === 'percent'
          ? (
              <>
                ≈
                {' '}
                {displayAmountShort}
                {' '}
                {loanTokenSymbol}
              </>
            )
          : undefined}
        desktopCta={(
          <SubmitButton
            disabled={submitDisabled}
            isLoading={isLoading}
            idleLabel={submitIdleLabel}
            loadingLabel={submitLoadingLabel}
          />
        )}
      />

      {showPreview && (
        <MarketAprPreview
          beforeUtil={beforeUtil}
          afterUtil={afterUtil!}
          beforeApr={beforeApr}
          afterApr={afterApr}
          showEstimateLabel={showAprEstimateLabel}
        />
      )}

      {needsApproval && (
        <InlineNotice tone="yellow">
          You need to approve the token spending first. This transaction will allow Morpho Blue to use your
          {' '}
          {loanTokenSymbol}
          .
        </InlineNotice>
      )}

      {!!amount && !!address && tokenBalance !== undefined && !needsApproval && !hasSufficientBalance && (
        <InlineNotice tone="yellow">Insufficient wallet balance for this deposit amount. Preview is shown, but deposit is disabled.</InlineNotice>
      )}

      {hasError && (
        <InlineNotice tone="red">{effectiveSupplyError?.message || approveError?.message || 'Transaction failed'}</InlineNotice>
      )}

      {/* Mobile CTA */}
      <div className="md:hidden">
        <SubmitButton
          disabled={submitDisabled}
          isLoading={isLoading}
          idleLabel={submitIdleLabel}
          loadingLabel={submitLoadingLabel}
        />
      </div>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to deposit
        </p>
      )}
    </form>
  )
}
