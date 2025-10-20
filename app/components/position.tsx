import type { MarketPosition as MarketPositionType } from '../lib/hooks/use-market-positions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { formatTimeAgo } from '../lib/formatters'
import { useIsClient } from '../lib/hooks/use-is-client'
import { useMarketPositions } from '../lib/hooks/use-market-positions'

function formatAmount(amount: number, decimals: number) {
  if (Number.isNaN(amount) || amount === 0) {
    return '0.00'
  }
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })
}

function PositionListItem({ position }: { position: MarketPositionType }) {
  const marketSupplyAssets = BigInt(position.market.state.supplyAssets)
  const marketSupplyShares = BigInt(position.market.state.supplyShares)
  const userSupplyShares = BigInt(position.state.supplyShares)
  const userBorrowShares = BigInt(position.state.borrowShares)
  const userCollateral = BigInt(position.state.collateral)
  const loanDecimals = position.market.loanAsset.decimals
  const collateralDecimals = position.market.collateralAsset.decimals || 18

  const suppliedAssets = useMemo(() => {
    if (marketSupplyShares === 0n)
      return 0n
    return (userSupplyShares * marketSupplyAssets) / marketSupplyShares
  }, [userSupplyShares, marketSupplyAssets, marketSupplyShares])

  const netSupplyApy = position.market.state.netSupplyApy * 100 // Convert to percentage

  return (
    <Link to={`/market/${position.market.uniqueKey}/${position.market.morphoBlue.chain.id}`}>
      <li className="mb-4 p-4 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors duration-200 cursor-pointer">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-lg font-semibold text-white">
              {position.market.collateralAsset.symbol}
              {' '}
              /
              {' '}
              {position.market.loanAsset.symbol}
            </p>
            <p className="text-xs text-gray-500">
              Chain ID:
              {' '}
              {position.market.morphoBlue.chain.id}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-green-400">
              APY:
              {' '}
              {netSupplyApy.toFixed(2)}
              %
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-gray-300">
            <span className="text-gray-400">Supply:</span>
            {' '}
            {formatAmount(
              Number(formatUnits(suppliedAssets, loanDecimals)),
              loanDecimals,
            )}
            {' '}
            {position.market.loanAsset.symbol}
          </p>

          {userCollateral > 0n && (
            <p className="text-gray-300">
              <span className="text-gray-400">Collateral:</span>
              {' '}
              {formatAmount(
                Number(formatUnits(userCollateral, collateralDecimals)),
                collateralDecimals,
              )}
              {' '}
              {position.market.collateralAsset.symbol}
            </p>
          )}

          {userBorrowShares > 0n && (
            <p className="text-gray-300">
              <span className="text-gray-400">Borrow Shares:</span>
              {' '}
              {formatAmount(
                Number(formatUnits(userBorrowShares, loanDecimals)),
                loanDecimals,
              )}
            </p>
          )}
        </div>
      </li>
    </Link>
  )
}

function PositionClient() {
  const { isConnected, address } = useAccount()
  const { data, isLoading, error, refetch, dataUpdatedAt } = useMarketPositions(address)

  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setTimeAgo(formatTimeAgo(dataUpdatedAt))
      const interval = setInterval(() => {
        setTimeAgo(formatTimeAgo(dataUpdatedAt))
      }, 5000) // update every 5 seconds
      return () => clearInterval(interval)
    }
  }, [dataUpdatedAt])

  if (!isConnected) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">
            Please connect your wallet to see your positions.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading your positions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-red-400">Error loading your positions.</p>
        </div>
      </div>
    )
  }

  const positions = data?.marketPositions.items ?? []

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden mb-8">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">My Position</h2>
          {timeAgo && (
            <span className="text-sm text-gray-400">
              (Updated
              {' '}
              {timeAgo}
              )
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 cursor-pointer"
        >
          Refresh
        </button>
      </div>
      <div className="p-6">
        {isLoading
          ? (
              <p className="text-gray-400">Loading your positions...</p>
            )
          : positions.length === 0
            ? (
                <p className="text-gray-400">You have no open positions.</p>
              )
            : (
                <ul>
                  {positions.map((position: MarketPositionType) => (
                    <PositionListItem key={position.id} position={position} />
                  ))}
                </ul>
              )}
      </div>
    </div>
  )
}

/**
 * Displays the connected wallet's position in a Morpho market.
 * It will show the assets supplied and borrowed by the user in the given market.
 */
export function Position() {
  const isClient = useIsClient()

  if (!isClient) {
    return (
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading position...</p>
        </div>
      </div>
    )
  }

  return <PositionClient />
}
