import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useDebugValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { AmountControl } from '~/components/ui/amount-control'
import { MarketAprPreview } from '~/components/ui/market-apr-preview'
import { formatBigintShort, formatDecimalStringShort } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket, useSupply, useTokenApproval, useTokenBalance, useTransactionStatus } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { ModeToggleSuffix } from './market-action-form/mode-toggle-suffix'
import { InlineNotice, SuccessMessage } from './market-action-form/status-message'
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
  const [showSuccess, setShowSuccess] = useState(false)

  useDebugValue({ mode, percentage, assetAmount, showSuccess, isClient })

  return {
    isClient,
    mode,
    setMode,
    percentage,
    setPercentage,
    assetAmount,
    setAssetAmount,
    showSuccess,
    setShowSuccess,
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
    showSuccess,
    setShowSuccess,
  } = useDepositFormState()
  const { address } = useAccount()

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
    approve,
    hash: approveHash,
    isPending: isApprovingToken,
    error: approveError,
    refetch: refetchApproval,
    isSimulating: isSimulatingApproval,
    isAllowanceReady,
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
    supply,
    hash: supplyHash,
    isPending: isSupplying,
    error: supplyError,
    isSimulating: isSimulatingSupply,
  } = useSupply(market, guardedAmount, market.loanAsset.decimals!)

  const { isSuccess: isSupplySuccess, isLoading: isSupplyLoading } = useTransactionStatus(supplyHash)
  const { isSuccess: isApproveSuccess, isLoading: isApproveLoading } = useTransactionStatus(approveHash)

  useEffect(() => {
    if (isApproveSuccess) {
      refetchApproval?.()
    }
  }, [isApproveSuccess, refetchApproval])

  useEffect(() => {
    if (isSupplySuccess) {
      setShowSuccess(true)
    }
  }, [isSupplySuccess])

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

    try {
      if (needsApproval) {
        approve()
      }
      else if (hasSufficientBalance) {
        supply()
      }
    }
    catch (error) {
      console.error('Transaction failed:', error)
    }
  }

  // Input handled by AmountControl

  const isLoading = isSupplying || isApprovingToken || isSupplyLoading || isApproveLoading || isSimulatingSupply || isSimulatingApproval || (!needsApproval && !isAllowanceReady && !!amount)
  const effectiveSupplyError = (!isAllowanceReady || needsApproval) ? undefined : supplyError
  const hasError = effectiveSupplyError || approveError
  const isSuccess = isSupplySuccess

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
      : isApprovingToken || isApproveLoading
        ? 'Approving...'
        : isSimulatingSupply
          ? 'Preparing deposit...'
          : 'Depositing...'
  const submitIdleLabel = needsApproval
    ? `Approve ${loanTokenSymbol}`
    : `Deposit ${displayAmountShort} ${loanTokenSymbol}`

  if (isSuccess && showSuccess) {
    return (
      <SuccessMessage
        message="Deposit successful!"
        onDismiss={() => {
          setShowSuccess(false)
          onSuccess?.()
        }}
      />
    )
  }

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

      {isApproveSuccess && !needsApproval && (
        <InlineNotice tone="green">
          Approval successful! You can now deposit your
          {' '}
          {loanTokenSymbol}
          .
        </InlineNotice>
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
