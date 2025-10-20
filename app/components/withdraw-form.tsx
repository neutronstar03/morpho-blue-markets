import type { SingleMorphoMarket } from '~/lib/hooks/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { formatNumber } from '~/lib/formatters'
import { useIsClient } from '../lib/hooks/use-is-client'
import { useMarket, useTransactionStatus, useUserPosition, useWithdraw } from '../lib/hooks/use-morpho'
import { Button } from './ui/button'

interface WithdrawFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function WithdrawForm({ market, loanTokenSymbol, onSuccess }: WithdrawFormProps) {
  const isClient = useIsClient()
  const [amount, setAmount] = useState('')
  const { address } = useAccount()

  const { data: position } = useUserPosition(market.uniqueKey, address)
  const { data: marketData } = useMarket(market.uniqueKey)

  const maxWithdrawableShares = useMemo(() => {
    if (!position || !position[0])
      return '0'
    return formatUnits(position[0], 18)
  }, [position])

  const maxWithdrawableAssets = useMemo(() => {
    if (!position || !position[0] || !marketData)
      return '0'
    const [supplyShares] = position
    const [totalSupplyAssets, totalSupplyShares] = marketData
    if (totalSupplyShares === 0n)
      return '0'

    const assets = (supplyShares * totalSupplyAssets) / totalSupplyShares
    return formatUnits(assets, market.loanAsset.decimals!)
  }, [position, marketData, market.loanAsset.decimals])

  const sharesToAssetsRatio = useMemo(() => {
    if (!maxWithdrawableShares || !maxWithdrawableAssets || !marketData)
      return 0
    return Number.parseFloat(maxWithdrawableAssets) / Number.parseFloat(maxWithdrawableShares)
  }, [maxWithdrawableShares, maxWithdrawableAssets, marketData])

  const {
    withdraw,
    hash: withdrawHash,
    isPending: isWithdrawing,
    error: withdrawError,
    isSimulating: isSimulatingWithdraw,
  } = useWithdraw(market, amount)
  const { isSuccess: isWithdrawSuccess, isLoading: isWithdrawLoading } = useTransactionStatus(withdrawHash)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !address || !isClient)
      return

    try {
      withdraw()
    }
    catch (error) {
      console.error('Withdrawal failed:', error)
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numbers and decimals
    if (/^\d*(?:\.\d*)?$/.test(value)) {
      setAmount(value)
    }
  }

  const handleMaxClick = () => {
    setAmount(maxWithdrawableShares)
  }

  const isLoading = isWithdrawing || isWithdrawLoading || isSimulatingWithdraw
  const hasError = withdrawError
  const isSuccess = isWithdrawSuccess

  if (isSuccess) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-green-800">
              Withdrawal successful!
            </p>
          </div>
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={onSuccess}
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
        <label htmlFor="withdraw-amount" className="block text-sm font-medium text-gray-700 mb-2">
          Amount to Withdraw (in shares)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            id="withdraw-amount"
            value={amount}
            onChange={handleAmountChange}
            placeholder="0.0"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMaxClick}
            className="px-3"
          >
            Max
          </Button>
        </div>
        {maxWithdrawableShares && Number.parseFloat(maxWithdrawableShares) > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            Max available:
            {' '}
            {maxWithdrawableShares}
            {' '}
            shares
          </p>
        )}
      </div>

      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            {withdrawError?.message || 'Withdrawal failed'}
          </p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!amount || isLoading || !address || Number.parseFloat(amount) > Number.parseFloat(maxWithdrawableShares)}
        className="w-full"
        variant="outline"
      >
        {isLoading
          ? (
              <>
                <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600" aria-hidden="true" />
                {isSimulatingWithdraw ? 'Preparing withdrawal...' : 'Withdrawing...'}
              </>
            )
          : (
              `Withdraw ${formatNumber(Number.parseFloat(amount) * sharesToAssetsRatio, market.loanAsset.decimals!)} ${loanTokenSymbol}`
            )}
      </Button>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to withdraw
        </p>
      )}

      {Number.parseFloat(amount) > Number.parseFloat(maxWithdrawableShares) && (
        <p className="text-sm text-red-600 text-center">
          Amount exceeds available balance
        </p>
      )}
    </form>
  )
}
