import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { StatPill } from '~/components/ui/stat-pill'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { formatMarketSize, formatPercent } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket } from '~/lib/hooks/rpc/use-morpho'
import { DepositForm } from './deposit-form'
import { MarketPosition } from './market-position'
import { WithdrawForm } from './withdraw-form'

interface MarketActionsProps {
  market: SingleMorphoMarket
}

export function MarketActions({ market }: MarketActionsProps) {
  const { address } = useAccount()
  const { isViewingWallet } = useViewingWallet()
  const [searchParams] = useSearchParams()

  const deepLink = useMemo(() => {
    const tab = searchParams.get('tab')
    const unit = searchParams.get('unit')
    const amount = searchParams.get('amount')

    const normalizedTab = tab === 'withdraw' || tab === 'deposit' ? tab : undefined
    const normalizedUnit = unit === 'asset' ? unit : undefined
    const normalizedAmount = amount && /^\d+(?:\.\d+)?$/.test(amount) && amount !== '0' ? amount : undefined

    if (!normalizedTab || !normalizedUnit || !normalizedAmount)
      return undefined

    return {
      tab: normalizedTab,
      unit: normalizedUnit,
      amount: normalizedAmount,
      key: `${market.uniqueKey}:${normalizedTab}:${normalizedUnit}:${normalizedAmount}`,
    } as const
  }, [market.uniqueKey, searchParams])

  // Initialize from deep-link so we don't render the default tab and then flip a tick later.
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>(() => deepLink?.tab ?? 'deposit')

  const appliedDeepLinkKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLink)
      return
    if (appliedDeepLinkKeyRef.current === deepLink.key)
      return

    appliedDeepLinkKeyRef.current = deepLink.key
    if (activeTab !== deepLink.tab)
      setActiveTab(deepLink.tab)
  }, [activeTab, deepLink])

  const depositPrefill = useMemo(() => {
    if (!deepLink || deepLink.tab !== 'deposit')
      return undefined
    return { mode: 'asset' as const, amount: deepLink.amount, key: deepLink.key }
  }, [deepLink])

  const withdrawPrefill = useMemo(() => {
    if (!deepLink || deepLink.tab !== 'withdraw')
      return undefined
    return { mode: 'asset' as const, amount: deepLink.amount, key: deepLink.key }
  }, [deepLink])

  // Live market state (RPC) + IRM-derived live rates.
  const { data: marketStateRaw } = useMarket(market.uniqueKey)
  const live = useMarketPreview({
    market,
    marketStateRaw,
    deltaSupplyAssets: 0n,
  })

  const utilization = live.utilizationBefore ?? market.state.utilization
  const supplyApr = live.supplyAprBefore
  const rateAtTargetApr = live.rateAtTargetApr
  const targetUtilization = 0.9
  const missingLiquidityTo90Usd = utilization > targetUtilization
    ? Math.max(0, market.state.supplyAssetsUsd * (utilization / targetUtilization - 1))
    : 0

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <MarketPosition market={market} />
      </div>
      <div className="pt-4 sm:pt-6">
        <div className="mb-4 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill
            className="flex-1"
            label="Utilization"
            value={formatPercent(utilization)}
          />
          <StatPill
            className="flex-1"
            label="Supply APR"
            value={supplyApr != null ? formatPercent(supplyApr) : '----'}
          />
          <StatPill
            className="flex-1"
            label="Rate at target APR"
            value={rateAtTargetApr != null ? formatPercent(rateAtTargetApr) : '—'}
          />
          {missingLiquidityTo90Usd > 0 && (
            <StatPill
              className="flex-1"
              label="To 90%"
              value={formatMarketSize(missingLiquidityTo90Usd)}
            />
          )}
        </div>

        <div className="mb-4 flex gap-2 sm:mb-6 sm:gap-3">
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'deposit'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'
            }`}
            onClick={() => setActiveTab('deposit')}
          >
            Supply
          </button>
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'withdraw'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'
            }`}
            onClick={() => setActiveTab('withdraw')}
          >
            Withdraw
          </button>
        </div>

        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
          {activeTab === 'deposit'
            ? (
                <DepositForm
                  market={market}
                  loanTokenSymbol={market.loanAsset.symbol}
                  prefill={depositPrefill}
                />
              )
            : (
                <WithdrawForm
                  market={market}
                  loanTokenSymbol={market.loanAsset.symbol}
                  prefill={withdrawPrefill}
                />
              )}
        </div>

        {!address && !isViewingWallet && (
          <p className="text-sm text-gray-400 mt-4 text-center">
            Connect your wallet to interact with this market
          </p>
        )}
      </div>
    </div>
  )
}
