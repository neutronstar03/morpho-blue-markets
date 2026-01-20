import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { AmountControl } from '~/components/ui/amount-control'
import { Button } from '~/components/ui/button'
import { MarketAprPreview } from '~/components/ui/market-apr-preview'
import { formatTokenAmountShort } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket, useTransactionStatus, useUserPosition, useWithdraw } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'

const WAD = 1_000_000_000_000_000_000n

interface WithdrawFormProps {
  market: SingleMorphoMarket
  loanTokenSymbol: string
  prefill?: { mode: 'asset', amount: string, key: string }
  onSuccess?: () => void
}

export function WithdrawForm({ market, loanTokenSymbol, prefill, onSuccess }: WithdrawFormProps) {
  const isClient = useIsClient()
  const [mode, setMode] = useLocalStorage<'percent' | 'asset'>('market:withdraw:unit', 'percent')
  // percentage string (0 - 100)
  const [percentage, setPercentage] = useState('')
  // asset amount string (token decimals)
  const [assetAmount, setAssetAmount] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const { address } = useAccount()

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

  const { data: position } = useUserPosition(market.uniqueKey, address)
  const { data: marketData } = useMarket(market.uniqueKey)
  const marketState = marketData

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
    if (mode === 'percent') {
      const pct = Number.parseFloat(percentage)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
        return 0n
      // Use fixed-point math to avoid float precision when scaling percentage
      const SCALE = 10000 // supports 0.01% precision
      // Always round DOWN to avoid producing slightly-more-than-intended shares.
      const pctScaled = BigInt(Math.floor(pct * SCALE))
      return (totalSharesWei * pctScaled) / (BigInt(100) * BigInt(SCALE))
    }

    // Asset amount mode: parse token amount -> convert to shares (round down) -> cap to liquidity-capped max.
    if (!assetAmount || !marketData)
      return 0n
    const [totalSupplyAssets, totalSupplyShares] = marketData
    if (totalSupplyAssets <= 0n || totalSupplyShares <= 0n)
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

    const sharesFromAssets = (assetsWei * totalSupplyShares) / totalSupplyAssets
    return sharesFromAssets < maxWithdrawSharesWei ? sharesFromAssets : maxWithdrawSharesWei
  }, [mode, percentage, assetAmount, marketData, market.loanAsset.decimals, totalSharesWei, maxWithdrawSharesWei])

  const sharesToWithdraw = useMemo(() => formatUnits(sharesToWithdrawWei, 18), [sharesToWithdrawWei])

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

  const withdrawAssets = useMemo(() => {
    if (!withdrawAssetsWei)
      return '0'
    return formatUnits(withdrawAssetsWei, market.loanAsset.decimals!)
  }, [withdrawAssetsWei, market.loanAsset.decimals])

  const withdrawAssetsShort = useMemo(() => {
    return formatTokenAmountShort(Number.parseFloat(withdrawAssets) || 0)
  }, [withdrawAssets])

  const percentOfPositionString = useMemo(() => {
    if (totalSharesWei <= 0n || sharesToWithdrawWei <= 0n)
      return '0'
    // 0..10000 hundredths
    let percentHundredths = (sharesToWithdrawWei * 10_000n) / totalSharesWei
    if (percentHundredths > 10_000n)
      percentHundredths = 10_000n
    const integer = percentHundredths / 100n
    const frac = percentHundredths % 100n
    if (frac === 0n)
      return integer.toString()
    return `${integer.toString()}.${frac.toString().padStart(2, '0')}`
  }, [sharesToWithdrawWei, totalSharesWei])

  const switchToPercent = () => {
    setMode('percent')
    setPercentage(percentOfPositionString)
  }

  const switchToAsset = () => {
    setMode('asset')
    setAssetAmount(withdrawAssets === '0' ? '' : withdrawAssets)
  }

  const utilizationAfterWad = useMemo(() => {
    if (!marketData || withdrawAssetsWei <= 0n)
      return undefined
    const [totalSupplyAssets, , totalBorrowAssets] = marketData
    const supplyAfter = totalSupplyAssets - withdrawAssetsWei
    // If supplyAfter is 0 (or negative due to rounding/edge cases), utilization is effectively > 100%
    // as long as there is any outstanding borrow.
    if (supplyAfter <= 0n)
      return totalBorrowAssets > 0n ? (WAD + 1n) : 0n
    return (totalBorrowAssets * WAD) / supplyAfter
  }, [marketData, withdrawAssetsWei])

  const isUtilizationAfterAbove100 = useMemo(() => {
    if (utilizationAfterWad == null)
      return false
    return utilizationAfterWad > WAD
  }, [utilizationAfterWad])

  const isAboveMaxWithdrawShares = useMemo(() => {
    // This can happen in percent mode if the user types 100% manually while the market has less liquidity than their full position.
    if (sharesToWithdrawWei <= 0n)
      return false
    if (maxWithdrawSharesWei <= 0n)
      return sharesToWithdrawWei > 0n
    return sharesToWithdrawWei > maxWithdrawSharesWei
  }, [sharesToWithdrawWei, maxWithdrawSharesWei])

  const sharesToWithdrawForTx = useMemo(() => {
    // If utilization would exceed 100%, onchain withdraw will revert (insufficient liquidity).
    // Avoid spamming simulate/reverts: disable simulation by passing empty amount.
    if (isUtilizationAfterAbove100 || isAboveMaxWithdrawShares)
      return ''
    return debouncedSharesToWithdraw
  }, [isUtilizationAfterAbove100, isAboveMaxWithdrawShares, debouncedSharesToWithdraw])

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

    const inputValue = mode === 'percent' ? percentage : assetAmount
    if (!inputValue || !address || !isClient)
      return

    try {
      withdraw()
    }
    catch (error) {
      console.error('Withdrawal failed:', error)
    }
  }

  // Input handling is encapsulated in AmountControl

  const handleMaxClick = () => {
    if (mode === 'percent') {
      setPercentage(maxWithdrawPercentString)
      return
    }

    if (!marketData) {
      setAssetAmount('')
      return
    }
    const [totalSupplyAssets, totalSupplyShares] = marketData
    if (totalSupplyAssets <= 0n || totalSupplyShares <= 0n) {
      setAssetAmount('')
      return
    }
    const maxAssetsWei = (maxWithdrawSharesWei * totalSupplyAssets) / totalSupplyShares
    const maxAssets = formatUnits(maxAssetsWei, market.loanAsset.decimals!)
    setAssetAmount(maxAssets === '0' ? '' : maxAssets)
  }

  const isLoading = isWithdrawing || isWithdrawLoading || isSimulatingWithdraw
  const hasError = withdrawError
  const isSuccess = isWithdrawSuccess
  const percentNumber = Number.parseFloat(percentage) || 0
  const assetNumber = Number.parseFloat(assetAmount) || 0
  const isPercentInvalid = !percentage || percentNumber <= 0 || percentNumber > 100
  const isAssetInvalid = !assetAmount || assetNumber <= 0
  const isInputInvalid = mode === 'percent' ? isPercentInvalid : isAssetInvalid

  const showPreview = !!address && !isInputInvalid && withdrawAssetsWei > 0n && preview.utilizationAfter != null
  const beforeUtil = preview.utilizationBefore ?? market.state.utilization
  const afterUtil = utilizationAfterWad != null
    ? Number.parseFloat(formatUnits(utilizationAfterWad, 18))
    : preview.utilizationAfter
  const beforeApr = preview.supplyAprBefore
  const afterApr = preview.supplyAprAfter
  const showAprEstimateLabel = afterApr != null

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
      <AmountControl
        label={mode === 'percent' ? 'Percentage to Withdraw' : `Amount to Withdraw (${loanTokenSymbol})`}
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
        desktopCta={(
          <Button
            type="submit"
            disabled={isInputInvalid || isLoading || !address || !isSharesDebounced || isUtilizationAfterAbove100 || isAboveMaxWithdrawShares}
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
                  `Withdraw ${withdrawAssetsShort} ${loanTokenSymbol}`
                )}
          </Button>
        )}
      />

      {showPreview && afterUtil != null && (
        <MarketAprPreview
          beforeUtil={beforeUtil}
          afterUtil={afterUtil}
          beforeApr={beforeApr}
          afterApr={afterApr}
          showEstimateLabel={showAprEstimateLabel}
        />
      )}

      {isUtilizationAfterAbove100 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            This withdrawal would push market utilization above 100% (not enough available liquidity). Reduce the amount.
          </p>
        </div>
      )}

      {isAboveMaxWithdrawShares && !isUtilizationAfterAbove100 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm text-yellow-800">
            This amount exceeds the maximum withdrawable given your position and current market liquidity. Use Max or reduce the amount.
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
          disabled={isInputInvalid || isLoading || !address || !isSharesDebounced || isUtilizationAfterAbove100 || isAboveMaxWithdrawShares}
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
                `Withdraw ${withdrawAssetsShort} ${loanTokenSymbol}`
              )}
        </Button>
      </div>

      {!address && (
        <p className="text-sm text-gray-500 text-center">
          Connect your wallet to withdraw
        </p>
      )}

      {mode === 'percent' && percentNumber > 100 && (
        <p className="text-sm text-red-600 text-center">
          Percentage exceeds 100%
        </p>
      )}
    </form>
  )
}
