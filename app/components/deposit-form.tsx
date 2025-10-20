import type { SingleMorphoMarket } from '~/lib/hooks/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { useIsClient } from '../lib/hooks/use-is-client'
import { formatTokenBalance, useSupply, useTokenApproval, useTokenBalance, useTransactionStatus } from '../lib/hooks/use-morpho'
import { Button } from './ui/button'

interface DepositFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function DepositForm({ market, loanTokenSymbol, onSuccess }: DepositFormProps) {
  const isClient = useIsClient()
  const [amount, setAmount] = useState('')
  const { address } = useAccount()
  const [debouncedAmount] = useDebounce(amount, 500)
  const isAmountDebounced = amount === debouncedAmount

  const {
    supply,
    hash: supplyHash,
    isPending: isSupplying,
    error: supplyError,
    isSimulating: isSimulatingSupply,
  } = useSupply(market, debouncedAmount, market.loanAsset.decimals!)
  const {
    needsApproval,
    approve,
    hash: approveHash,
    isPending: isApprovingToken,
    error: approveError,
    refetch: refetchApproval,
    isSimulating: isSimulatingApproval,
  } = useTokenApproval(market.loanAsset.address, debouncedAmount, address, market.loanAsset.decimals)

  const { data: tokenBalance } = useTokenBalance(market.loanAsset.address, address)
  const formattedBalance = formatTokenBalance(tokenBalance, market.loanAsset.decimals)

  const { isSuccess: isSupplySuccess, isLoading: isSupplyLoading } = useTransactionStatus(supplyHash)
  const { isSuccess: isApproveSuccess, isLoading: isApproveLoading } = useTransactionStatus(approveHash)

  useEffect(() => {
    if (isApproveSuccess) {
      refetchApproval?.()
    }
  }, [isApproveSuccess, refetchApproval])

  const handleMaxClick = () => {
    if (tokenBalance) {
      setAmount(formatUnits(tokenBalance, market.loanAsset.decimals!))
    }
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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and decimals
    if (/^\d*(?:\.\d*)?$/.test(value)) {
      setAmount(value)
    }
  }

  const isLoading = isSupplying || isApprovingToken || isSupplyLoading || isApproveLoading || isSimulatingSupply || isSimulatingApproval
  const hasError = supplyError || approveError
  const isSuccess = isSupplySuccess

  if (isSuccess) {
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
                onClick={() => onSuccess?.()}
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
      <div>
        <label htmlFor="deposit-amount" className="block text-sm font-medium text-gray-700 mb-2">
          Amount to Deposit (
          {loanTokenSymbol}
          )
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="deposit-amount"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0.0"
            className="w-full flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMaxClick}
            className="px-3"
            disabled={!tokenBalance}
          >
            Max
          </Button>
        </div>
        {address && (
          <div className="text-sm text-gray-600 mt-1">
            Wallet balance:
            {' '}
            <span className="font-medium">
              {formattedBalance}
              {' '}
              {loanTokenSymbol}
            </span>
          </div>
        )}
      </div>

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
            {supplyError?.message || approveError?.message || 'Transaction failed'}
          </p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!amount || isLoading || !address || !isAmountDebounced}
        className="w-full"
      >
        {isLoading
          ? (
              <>
                <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" aria-hidden="true" />
                {isSimulatingApproval
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

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to deposit
        </p>
      )}
    </form>
  )
}
