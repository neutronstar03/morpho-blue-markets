import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { DepositForm } from '../deposit-form'
import { WithdrawForm } from '../withdraw-form'
import { useUserPosition } from '../../lib/hooks/use-morpho'
import type { FormattedMarket } from '../../lib/hooks/use-market'
import type { MarketParams } from '../../lib/hooks/use-morpho'

interface MarketActionsProps {
  market: FormattedMarket
  marketParams: MarketParams
}

export function MarketActions({ market, marketParams }: MarketActionsProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const { address } = useAccount()
  const { data: position } = useUserPosition(marketParams, address)
  const userSupplyShares = position ? formatEther(position[0]) : '0'

  return (
    <div className="p-6">
      <div className="mt-2 pt-6 border-t border-gray-700">
        <div className="flex gap-3 mb-6">
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'deposit'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('deposit')}
          >
            Supply
          </button>
          <button
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'withdraw'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('withdraw')}
          >
            Withdraw
          </button>
        </div>

        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
          {activeTab === 'deposit' ? (
            <DepositForm
              marketParams={marketParams}
              loanTokenSymbol={market.loanAsset.symbol}
            />
          ) : (
            <WithdrawForm
              marketParams={marketParams}
              loanTokenSymbol={market.loanAsset.symbol}
              maxWithdrawable={userSupplyShares}
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
