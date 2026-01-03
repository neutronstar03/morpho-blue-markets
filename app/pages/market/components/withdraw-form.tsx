import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { Button } from '~/components/ui/button'
import { PercentageControl } from '~/components/ui/percentage-control'
import { formatDecimalStringShort, formatPercent, formatTokenAmountShort } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket, useTransactionStatus, useUserPosition, useWithdraw } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'

const WAD = 1_000_000_000_000_000_000n

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
  const marketState = marketData

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

  const maxWithdrawSharesWei = useMemo(() => {
    // Compute MAX in terms of shares (tx input), capped by available market liquidity.
    if (!marketData || totalSharesWei <= 0n)
      return 0n
    const [totalSupplyAssets, totalSupplyShares, totalBorrowAssets] = marketData
    if (totalSupplyAssets <= 0n || totalSupplyShares <= 0n)
      return 0n
    const availableAssets = totalSupplyAssets - totalBorrowAssets
    if (availableAssets <= 0n)
      return 0n

    // Convert available assets to shares at the current exchange rate, rounded DOWN.
    const liquidityShares = (availableAssets * totalSupplyShares) / totalSupplyAssets
    return liquidityShares < totalSharesWei ? liquidityShares : totalSharesWei
  }, [marketData, totalSharesWei])

  const maxWithdrawPercentString = useMemo(() => {
    // Set Max as a percentage of the user's own position, but derive it from shares (not assets)
    // and round DOWN to avoid simulate/tx reverts due to tiny rounding errors.
    if (totalSharesWei <= 0n)
      return '0'

    // percentHundredths: 0..10000, where 1234 => 12.34%
    let percentHundredths = (maxWithdrawSharesWei * 10_000n) / totalSharesWei
    if (percentHundredths > 10_000n)
      percentHundredths = 10_000n

    // Safety margin: if we're not at 0% or 100%, back off by 0.01%.
    // This prevents edge-case rounding in share/asset conversions from crossing the revert threshold.
    if (percentHundredths > 0n && percentHundredths < 10_000n)
      percentHundredths -= 1n

    const integer = percentHundredths / 100n
    const frac = percentHundredths % 100n
    if (frac === 0n)
      return integer.toString()
    return `${integer.toString()}.${frac.toString().padStart(2, '0')}`
  }, [maxWithdrawSharesWei, totalSharesWei])

  const sharesToWithdrawWei = useMemo(() => {
    const pct = Number.parseFloat(percentage)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
      return 0n
    // Use fixed-point math to avoid float precision when scaling percentage
    const SCALE = 10000 // supports 0.01% precision
    // Always round DOWN to avoid producing slightly-more-than-intended shares.
    const pctScaled = BigInt(Math.floor(pct * SCALE))
    return (totalSharesWei * pctScaled) / (BigInt(100) * BigInt(SCALE))
  }, [percentage, totalSharesWei])

  const sharesToWithdraw = useMemo(() => {
    return formatUnits(sharesToWithdrawWei, 18)
  }, [sharesToWithdrawWei])

  // Debounce the expensive RPC-driven hooks (simulate + IRM preview) while keeping
  // the UI responsive (slider/amount updates immediately).
  // Note: IRM preview is now computed locally; this debounce is mainly to avoid
  // spamming withdraw simulation RPC calls while dragging.
  const [debouncedSharesToWithdraw] = useDebounce(sharesToWithdraw, 500)
  const isSharesDebounced = sharesToWithdraw === debouncedSharesToWithdraw

  const withdrawAssetsWei = useMemo(() => {
    if (!marketData || sharesToWithdrawWei <= 0n)
      return 0n
    const [totalSupplyAssets, totalSupplyShares] = marketData
    if (!totalSupplyShares || totalSupplyShares === 0n)
      return 0n
    return (sharesToWithdrawWei * totalSupplyAssets) / totalSupplyShares
  }, [marketData, sharesToWithdrawWei])

  const utilizationAfterWad = useMemo(() => {
    if (!marketData || withdrawAssetsWei <= 0n)
      return undefined
    const [totalSupplyAssets, , totalBorrowAssets] = marketData
    const supplyAfter = totalSupplyAssets - withdrawAssetsWei
    if (supplyAfter <= 0n)
      return undefined
    return (totalBorrowAssets * WAD) / supplyAfter
  }, [marketData, withdrawAssetsWei])

  const isUtilizationAfterAbove100 = useMemo(() => {
    if (utilizationAfterWad == null)
      return false
    return utilizationAfterWad > WAD
  }, [utilizationAfterWad])

  const sharesToWithdrawForTx = useMemo(() => {
    // If utilization would exceed 100%, onchain withdraw will revert (insufficient liquidity).
    // Avoid spamming simulate/reverts: disable simulation by passing empty amount.
    if (isUtilizationAfterAbove100)
      return ''
    return debouncedSharesToWithdraw
  }, [isUtilizationAfterAbove100, debouncedSharesToWithdraw])

  const preview = useMarketPreview({
    market,
    marketStateRaw: marketState,
    deltaSupplyAssets: -withdrawAssetsWei,
  })

  const {
    withdraw,
    hash: withdrawHash,
    isPending: isWithdrawing,
    error: withdrawError,
    isSimulating: isSimulatingWithdraw,
  } = useWithdraw(market, sharesToWithdrawForTx)
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
    setPercentage(maxWithdrawPercentString)
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

  const showPreview = !!address && !isPercentInvalid && withdrawAssetsWei > 0n && preview.utilizationAfter != null
  const beforeUtil = preview.utilizationBefore ?? market.state.utilization
  const afterUtil = utilizationAfterWad != null
    ? Number.parseFloat(formatUnits(utilizationAfterWad, 18))
    : preview.utilizationAfter
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
            <span className="text-gray-200">{formatDecimalStringShort(maxWithdrawableShares)}</span>
            {' '}
            shares
          </>
        )}
        rightHelper={(
          <>
            ≈
            {' '}
            {formatTokenAmountShort(assetsAtPercent)}
            {' '}
            {loanTokenSymbol}
            {' '}
            ·
            {' '}
            {formatDecimalStringShort(sharesToWithdraw)}
            {' '}
            shares
          </>
        )}
        desktopCta={(
          <Button
            type="submit"
            disabled={isPercentInvalid || isLoading || !address || !isSharesDebounced || isUtilizationAfterAbove100}
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
                  `Withdraw ${formatTokenAmountShort(assetsAtPercent)} ${loanTokenSymbol}`
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
              {afterUtil != null ? formatPercent(afterUtil) : '—'}
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

      {isUtilizationAfterAbove100 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            This withdrawal would push market utilization above 100% (not enough available liquidity). Reduce the amount.
          </p>
        </div>
      )}

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
          disabled={isPercentInvalid || isLoading || !address || !isSharesDebounced || isUtilizationAfterAbove100}
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
                `Withdraw ${formatTokenAmountShort(assetsAtPercent)} ${loanTokenSymbol}`
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
