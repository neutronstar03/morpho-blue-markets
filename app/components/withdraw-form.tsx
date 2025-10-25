import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { formatNumber } from '~/lib/formatters'
import { useMarket, useTransactionStatus, useUserPosition, useWithdraw } from '../lib/hooks/rpc/use-morpho'
import { useIsClient } from '../lib/hooks/use-is-client'
import { Button } from './ui/button'
import { PercentageControl } from './ui/percentage-control'

interface WithdrawFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  onSuccess?: () => void
}

export function WithdrawForm({ market, loanTokenSymbol, onSuccess }: WithdrawFormProps) {
  const isClient = useIsClient()
  // percentage string (0 - 100)
  const [percentage, setPercentage] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
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

  // Derived assets preview handled directly from percentage and max assets

  // Convert percentage into shares string (18 decimals) for the withdraw hook
  const totalSharesWei = useMemo(() => {
    return position && position[0] ? position[0] : 0n
  }, [position])

  const sharesToWithdrawWei = useMemo(() => {
    const pct = Number.parseFloat(percentage)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
      return 0n
    // Use fixed-point math to avoid float precision when scaling percentage
    const SCALE = 10000 // supports 0.01% precision
    const pctScaled = BigInt(Math.round(pct * SCALE))
    return (totalSharesWei * pctScaled) / (BigInt(100) * BigInt(SCALE))
  }, [percentage, totalSharesWei])

  const sharesToWithdraw = useMemo(() => {
    return formatUnits(sharesToWithdrawWei, 18)
  }, [sharesToWithdrawWei])

  const {
    withdraw,
    hash: withdrawHash,
    isPending: isWithdrawing,
    error: withdrawError,
    isSimulating: isSimulatingWithdraw,
  } = useWithdraw(market, sharesToWithdraw)
  const { isSuccess: isWithdrawSuccess, isLoading: isWithdrawLoading } = useTransactionStatus(withdrawHash)

  useEffect(() => {
    if (isWithdrawSuccess) {
      setShowSuccess(true)
    }
  }, [isWithdrawSuccess])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!percentage || !address || !isClient)
      return

    try {
      withdraw()
    }
    catch (error) {
      console.error('Withdrawal failed:', error)
    }
  }

  // Input handling is encapsulated in PercentageControl

  const handleMaxClick = () => {
    setPercentage('100')
  }

  const isLoading = isWithdrawing || isWithdrawLoading || isSimulatingWithdraw
  const hasError = withdrawError
  const isSuccess = isWithdrawSuccess
  const percentNumber = Number.parseFloat(percentage) || 0
  const isPercentInvalid = !percentage || percentNumber <= 0 || percentNumber > 100
  const assetsAtPercent = useMemo(() => {
    const maxAssets = Number.parseFloat(maxWithdrawableAssets) || 0
    return (percentNumber / 100) * maxAssets
  }, [percentNumber, maxWithdrawableAssets])

  if (isSuccess && showSuccess) {
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
        label="Percentage to Withdraw"
        percentage={percentage}
        onChange={setPercentage}
        onMax={handleMaxClick}
        leftHelper={(
          <>
            Max available:
            {' '}
            <span className="text-gray-200">{maxWithdrawableShares}</span>
            {' '}
            shares
          </>
        )}
        rightHelper={(
          <>
            ≈
            {' '}
            {formatNumber(assetsAtPercent, market.loanAsset.decimals!)}
            {' '}
            {loanTokenSymbol}
            {' '}
            ·
            {' '}
            {sharesToWithdraw}
            {' '}
            shares
          </>
        )}
        desktopCta={(
          <Button
            type="submit"
            disabled={isPercentInvalid || isLoading || !address}
            className="w-full"
          >
            {isLoading
              ? (
                  <>
                    <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" aria-hidden="true" />
                    {isSimulatingWithdraw ? 'Preparing...' : 'Withdraw'}
                  </>
                )
              : (
                  `Withdraw ${formatNumber(assetsAtPercent, market.loanAsset.decimals!)} ${loanTokenSymbol}`
                )}
          </Button>
        )}
      />

      {hasError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">
            {withdrawError?.message || 'Withdrawal failed'}
          </p>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="md:hidden">
        <Button
          type="submit"
          disabled={isPercentInvalid || isLoading || !address}
          className="w-full"
          variant="outline"
        >
          {isLoading
            ? (
                <>
                  <ArrowPathIcon className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-300" aria-hidden="true" />
                  {isSimulatingWithdraw ? 'Preparing withdrawal...' : 'Withdrawing...'}
                </>
              )
            : (
                `Withdraw ${formatNumber(assetsAtPercent, market.loanAsset.decimals!)} ${loanTokenSymbol}`
              )}
        </Button>
      </div>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to withdraw
        </p>
      )}

      {percentNumber > 100 && (
        <p className="text-sm text-red-600 text-center">
          Percentage exceeds 100%
        </p>
      )}
    </form>
  )
}
