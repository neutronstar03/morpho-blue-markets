import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { StatPill } from '~/components/ui/stat-pill'
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
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const { address } = useAccount()

  // Live market state (RPC) + IRM-derived live rates.
  const { data: marketStateRaw } = useMarket(market.uniqueKey)
  const live = useMarketPreview({
    market,
    marketStateRaw,
    deltaSupplyAssets: 0n,
  })

  const utilization = live.utilizationBefore ?? market.state.utilization
  const supplyApy = live.supplyApyBefore ?? market.state.supplyApy ?? market.state.netSupplyApy
  const rateAtTargetApy = live.rateAtTargetApy ?? market.state.apyAtTarget
  const targetUtilization = 0.9
  const missingLiquidityTo90Usd = utilization > targetUtilization
    ? Math.max(0, market.state.supplyAssetsUsd * (utilization / targetUtilization - 1))
    : 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <MarketPosition market={market} />
      </div>
      <div className="pt-6 border-t border-gray-700">
        <div className="mb-4 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill
            className="flex-1"
            label="Utilization"
            value={formatPercent(utilization)}
          />
          <StatPill
            className="flex-1"
            label="Supply APY"
            value={formatPercent(supplyApy)}
          />
          <StatPill
            className="flex-1"
            label="Rate at target"
            value={rateAtTargetApy != null ? formatPercent(rateAtTargetApy) : '—'}
          />
          {missingLiquidityTo90Usd > 0 && (
            <StatPill
              className="flex-1"
              label="To 90%"
              value={formatMarketSize(missingLiquidityTo90Usd)}
            />
          )}
        </div>

        <div className="flex gap-3 mb-6">
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
                />
              )
            : (
                <WithdrawForm
                  market={market}
                  loanTokenSymbol={market.loanAsset.symbol}
                />
              )}
        </div>

        {!address && (
          <p className="text-sm text-gray-400 mt-4 text-center">
            Connect your wallet to interact with this market
          </p>
        )}
      </div>
    </div>
  )
}
