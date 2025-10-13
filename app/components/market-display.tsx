import { useState } from 'react'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { useUserPosition } from '../lib/hooks/use-morpho'
import type { FormattedMarket } from '../lib/hooks/use-market'
import type { MarketParams } from '../lib/hooks/use-morpho'

const formatAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString()

interface MarketDisplayProps {
  market: FormattedMarket
}

export function MarketDisplay({ market }: MarketDisplayProps) {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const { address } = useAccount()

  const marketParams: MarketParams = {
    loanToken: market.loanAsset.address,
    collateralToken: market.collateralAsset.address,
    oracle: market.oracleAddress,
    irm: market.irmAddress,
    lltv: market.lltvRaw,
  }

  const { data: position } = useUserPosition(marketParams, address)

  const userSupplyShares = position ? formatEther(position[0]) : '0'
  const userCollateral = position ? formatEther(position[2]) : '0'

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
      {/* Market Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {market.name}
            </h2>
            <p className="text-gray-300">{market.pair}</p>
            <p className="text-sm text-gray-400 mt-1">{market.chainName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Market ID</p>
            <p className="font-mono text-sm text-gray-300">{formatAddress(market.id)}</p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-900/30 border border-green-700/50 p-4 rounded-lg">
            <p className="text-sm font-medium text-green-300">Total Supply</p>
            <p className="text-2xl font-bold text-green-100">{market.totalSupplyFormatted}</p>
          </div>
          <div className="bg-blue-900/30 border border-blue-700/50 p-4 rounded-lg">
            <p className="text-sm font-medium text-blue-300">Total Borrow</p>
            <p className="text-2xl font-bold text-blue-100">{market.totalBorrowFormatted}</p>
          </div>
          <div className="bg-purple-900/30 border border-purple-700/50 p-4 rounded-lg">
            <p className="text-sm font-medium text-purple-300">Supply APY</p>
            <p className="text-2xl font-bold text-purple-100">{market.supplyApyFormatted}</p>
          </div>
          <div className="bg-orange-900/30 border border-orange-700/50 p-4 rounded-lg">
            <p className="text-sm font-medium text-orange-300">Utilization</p>
            <p className="text-2xl font-bold text-orange-100">{market.utilizationFormatted}</p>
          </div>
          <div className="bg-indigo-900/30 border border-indigo-700/50 p-4 rounded-lg">
            <p className="text-sm font-medium text-indigo-300">LLTV</p>
            <p className="text-2xl font-bold text-indigo-100">{market.lltvPercent}</p>
          </div>
        </div>
      </div>

      {/* Market Details */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Market Details</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets */}
          <div>
            <h4 className="font-medium text-gray-200 mb-3">Assets</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Loan Token:</span>
                <div className="text-right">
                  <p className="font-medium text-white">{market.loanAsset.symbol}</p>
                  {market.loanAsset.name && (
                    <p className="text-sm text-gray-400">{market.loanAsset.name}</p>
                  )}
                  <p className="font-mono text-xs text-gray-500">
                    {formatAddress(market.loanAsset.address)}
                  </p>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Collateral Token:</span>
                <div className="text-right">
                  <p className="font-medium text-white">{market.collateralAsset.symbol}</p>
                  {market.collateralAsset.name && (
                    <p className="text-sm text-gray-400">{market.collateralAsset.name}</p>
                  )}
                  <p className="font-mono text-xs text-gray-500">
                    {formatAddress(market.collateralAsset.address)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Parameters */}
          <div>
            <h4 className="font-medium text-gray-200 mb-3">Parameters</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Oracle:</span>
                <span className="font-mono text-xs text-gray-300">{formatAddress(market.oracleAddress)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Interest Rate Model:</span>
                <span className="font-mono text-xs text-gray-300">{formatAddress(market.irmAddress)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Whitelisted:</span>
                <span className="font-medium text-white">{market.whitelisted ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Creation Info */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Created: {formatDate(market.createdAt)}</span>
            <span>Borrow APY: {market.borrowApyFormatted}</span>
          </div>
        </div>

        {/* User Position */}
        {address && (
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h4 className="font-medium text-gray-200 mb-3">Your Position</h4>
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Supply Shares:</p>
                  <p className="font-medium text-white">{userSupplyShares}</p>
                </div>
                <div>
                  <p className="text-gray-400">Collateral:</p>
                  <p className="font-medium text-white">
                    {userCollateral} {market.collateralAsset.symbol}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons - Interactive deposit/withdraw functionality */}
        <div className="mt-8 pt-6 border-t border-gray-700">
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
    </div>
  )
}
