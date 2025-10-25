import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { DepositForm } from '../deposit-form'
import { WithdrawForm } from '../withdraw-form'
import { UserPosition } from './user-position'

interface MarketActionsProps {
  market: SingleMorphoMarket
}

export function MarketActions({ market }: MarketActionsProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const { address } = useAccount()

  return (
    <div className="p-6">
      <div className="mb-6">
        <UserPosition market={market} />
      </div>
      <div className="pt-6 border-t border-gray-700">
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
