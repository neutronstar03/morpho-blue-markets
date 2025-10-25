import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { formatTokenBalance, useSupply, useTokenApproval, useTokenBalance, useTransactionStatus } from '../lib/hooks/rpc/use-morpho'
import { useIsClient } from '../lib/hooks/use-is-client'
import { Button } from './ui/button'
import { PercentageControl } from './ui/percentage-control'

interface DepositFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function DepositForm({ market, loanTokenSymbol, onSuccess }: DepositFormProps) {
  const isClient = useIsClient()
  const [percentage, setPercentage] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const { address } = useAccount()

  // Wallet balance
  const { data: tokenBalance } = useTokenBalance(market.loanAsset.address, address)
  const formattedBalance = formatTokenBalance(tokenBalance, market.loanAsset.decimals)

  // Derive amount from percentage of wallet balance
  const amountWei = useMemo(() => {
    const pct = Number.parseFloat(percentage)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100 || !tokenBalance)
      return 0n
    const SCALE = 10000
    const pctScaled = BigInt(Math.round(pct * SCALE))
    return (tokenBalance * pctScaled) / (BigInt(100) * BigInt(SCALE))
  }, [percentage, tokenBalance])

  const amount = useMemo(() => {
    if (!amountWei)
      return ''
    return formatUnits(amountWei, market.loanAsset.decimals!)
  }, [amountWei, market.loanAsset.decimals])

  const [debouncedAmount] = useDebounce(amount, 500)
  const isAmountDebounced = amount === debouncedAmount

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
    setPercentage('100')
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

  // Input handled by PercentageControl

  const isLoading = isSupplying || isApprovingToken || isSupplyLoading || isApproveLoading || isSimulatingSupply || isSimulatingApproval || (!needsApproval && !isAllowanceReady && !!amount)
  const effectiveSupplyError = (!isAllowanceReady || needsApproval) ? undefined : supplyError
  const hasError = effectiveSupplyError || approveError
  const isSuccess = isSupplySuccess

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
      <PercentageControl
        label="Percentage to Deposit"
        percentage={percentage}
        onChange={setPercentage}
        onMax={handleMaxClick}
        leftHelper={address
          ? (
              <>
                Wallet balance:
                {' '}
                <span className="text-gray-200">{formattedBalance}</span>
                {' '}
                {loanTokenSymbol}
              </>
            )
          : undefined}
        rightHelper={(
          <>
            ≈
            {' '}
            {amount || '0'}
            {' '}
            {loanTokenSymbol}
          </>
        )}
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
                    `Deposit ${amount || '0'} ${loanTokenSymbol}`
                  )}
          </Button>
        )}
      />

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
                  `Deposit ${amount || '0'} ${loanTokenSymbol}`
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
