import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { AmountControl } from '~/components/ui/amount-control'
import { Button } from '~/components/ui/button'
import { formatBigintShort, formatDecimalStringShort, formatPercent } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket, useSupply, useTokenApproval, useTokenBalance, useTransactionStatus } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'

interface DepositFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function DepositForm({ market, loanTokenSymbol, onSuccess }: DepositFormProps) {
  const isClient = useIsClient()
  const [mode, setMode] = useLocalStorage<'percent' | 'asset'>('market:deposit:unit', 'percent')
  const [percentage, setPercentage] = useState('')
  const [assetAmount, setAssetAmount] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const { address } = useAccount()

  const { data: marketStateRaw } = useMarket(market.uniqueKey)

  // Wallet balance
  const { data: tokenBalance } = useTokenBalance(market.loanAsset.address, address)

  // Derive amount from percentage of wallet balance
  const amountWei = useMemo(() => {
    if (!tokenBalance)
      return 0n

    if (mode === 'percent') {
      const pct = Number.parseFloat(percentage)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
        return 0n
      const SCALE = 10000
      const pctScaled = BigInt(Math.round(pct * SCALE))
      return (tokenBalance * pctScaled) / (BigInt(100) * BigInt(SCALE))
    }

    if (!assetAmount)
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
    return assetsWei < tokenBalance ? assetsWei : tokenBalance
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
    if (!debouncedAmount)
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

  // Gate supply simulation until allowance is known and sufficient
  const guardedAmount = isAllowanceReady && !needsApproval ? debouncedAmount : ''

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
      else {
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

  const showPreview = !!address && debouncedAmountWei > 0n && preview.utilizationAfter != null
  const beforeUtil = preview.utilizationBefore ?? market.state.utilization
  const afterUtil = preview.utilizationAfter
  const beforeApy = preview.supplyApyBefore ?? market.state.netSupplyApy
  const afterApy = preview.supplyApyAfter ?? preview.estimatedSupplyApyAfter
  const isApyEstimated = preview.supplyApyAfter == null && afterApy != null

  if (isSuccess && showSuccess) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-green-800">
              Deposit successful!
            </p>
          </div>
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={() => {
                  setShowSuccess(false)
                  onSuccess?.()
                }}
                className="inline-flex bg-green-50 rounded-md p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-50 focus:ring-green-600"
              >
                <span className="sr-only">Dismiss</span>
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
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
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={switchToPercent}
              className={`px-1.5 py-0.5 rounded border border-white/10 text-xs ${mode === 'percent' ? 'bg-white/10 text-gray-100' : 'text-gray-300 hover:bg-white/10'}`}
              aria-label="Switch to percentage"
            >
              %
            </button>
            <button
              type="button"
              onClick={switchToAsset}
              className={`px-1.5 py-0.5 rounded border border-white/10 text-xs ${mode === 'asset' ? 'bg-white/10 text-gray-100' : 'text-gray-300 hover:bg-white/10'}`}
              aria-label={`Switch to ${loanTokenSymbol} amount`}
            >
              {loanTokenSymbol}
            </button>
          </span>
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
          <Button
            type="submit"
            disabled={!amount || isLoading || !address || !isAmountDebounced || (!isAllowanceReady && !!amount)}
            className="w-full"
          >
            {isLoading
              ? (
                  <>
                    <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" aria-hidden="true" />
                    {(!isAllowanceReady && !!amount)
                      ? 'Checking allowance...'
                      : isSimulatingApproval
                        ? 'Preparing approval...'
                        : isApprovingToken || isApproveLoading
                          ? 'Approving...'
                          : isSimulatingSupply
                            ? 'Preparing deposit...'
                            : 'Depositing...'}
                  </>
                )
              : needsApproval
                ? (
                    `Approve ${loanTokenSymbol}`
                  )
                : (
                    `Deposit ${displayAmountShort} ${loanTokenSymbol}`
                  )}
          </Button>
        )}
      />

      {showPreview && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Utilization</span>
            <span className="text-gray-200">
              {formatPercent(beforeUtil)}
              {' '}
              →
              {' '}
              {formatPercent(afterUtil!)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-gray-400">Supply APY</span>
            <span className="text-gray-200">
              {formatPercent(beforeApy)}
              {' '}
              →
              {' '}
              {afterApy != null ? formatPercent(afterApy) : (preview.isBorrowRateLoading ? 'Loading…' : '—')}
              {isApyEstimated && <span className="ml-1 text-gray-500">(est.)</span>}
            </span>
          </div>
        </div>
      )}

      {isApproveSuccess && !needsApproval && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-800">
            Approval successful! You can now deposit your
            {' '}
            {loanTokenSymbol}
            .
          </p>
        </div>
      )}

      {needsApproval && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            You need to approve the token spending first. This transaction will allow Morpho Blue to use your
            {' '}
            {loanTokenSymbol}
            .
          </p>
        </div>
      )}

      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            {effectiveSupplyError?.message || approveError?.message || 'Transaction failed'}
          </p>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="md:hidden">
        <Button
          type="submit"
          disabled={!amount || isLoading || !address || !isAmountDebounced || (!isAllowanceReady && !!amount)}
          className="w-full"
        >
          {isLoading
            ? (
                <>
                  <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" aria-hidden="true" />
                  {(!isAllowanceReady && !!amount)
                    ? 'Checking allowance...'
                    : isSimulatingApproval
                      ? 'Preparing approval...'
                      : isApprovingToken || isApproveLoading
                        ? 'Approving...'
                        : isSimulatingSupply
                          ? 'Preparing deposit...'
                          : 'Depositing...'}
                </>
              )
            : needsApproval
              ? (
                  `Approve ${loanTokenSymbol}`
                )
              : (
                  `Deposit ${displayAmountShort} ${loanTokenSymbol}`
                )}
        </Button>
      </div>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to deposit
        </p>
      )}
    </form>
  )
}
