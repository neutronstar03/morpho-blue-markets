import type {
  LiveMarketPosition,
} from '../lib/hooks/rpc/use-live-market-positions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatAmountSpecific, formatTimeAgo } from '../lib/formatters'
import {
  useLiveMarketPositions,
} from '../lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '../lib/hooks/use-is-client'
import { useRefreshWithCooldown } from '../lib/hooks/use-refresh-with-cooldown'
import { Card } from './ui/card'

function PositionListItem({
  position,
  chainId,
}: {
  position: LiveMarketPosition
  chainId: number
}) {
  const marketSupplyAssets = BigInt(position.market.state.supplyAssets)
  const marketSupplyShares = BigInt(position.market.state.supplyShares)
  const userSupplyShares = BigInt(position.userState.supplyShares)
  const loanDecimals = position.market.loanAsset.decimals ?? 18

  const suppliedAssets = useMemo(() => {
    if (marketSupplyShares === 0n)
      return 0n
    return (userSupplyShares * marketSupplyAssets) / marketSupplyShares
  }, [userSupplyShares, marketSupplyAssets, marketSupplyShares])

  const netSupplyApy = position.market.state.netSupplyApy * 100 // Convert to percentage

  return (
    <Link to={`/market/${position.market.uniqueKey}/${chainId}`}>
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
              {chainId}
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
            {formatAmountSpecific(suppliedAssets, loanDecimals)}
            {' '}
            {position.market.loanAsset.symbol}
          </p>
        </div>
      </li>
    </Link>
  )
}

function PositionClient() {
  const { isConnected, chain } = useAccount()
  const {
    data: positions,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useLiveMarketPositions()

  const [timeAgo, setTimeAgo] = useState('')
  const { handleRefresh, isRefreshing, isCooldown } = useRefreshWithCooldown(refetch)

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
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">
            Please connect your wallet to see your positions.
          </p>
        </div>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading your positions...</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mb-8">
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
          onClick={() => handleRefresh()}
          disabled={isRefreshing || isCooldown}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 cursor-pointer"
        >
          {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
        </button>
      </div>
      <div className="p-6">
        {isLoading
          ? (
              <p className="text-gray-400">Loading your positions...</p>
            )
          : positions && positions.length === 0
            ? (
                <p className="text-gray-400">You have no open positions.</p>
              )
            : (
                <ul>
                  {positions
                    && chain?.id
                    && positions.map((position: LiveMarketPosition) => (
                      <PositionListItem
                        key={position.market.uniqueKey}
                        position={position}
                        chainId={chain.id}
                      />
                    ))}
                </ul>
              )}
      </div>
    </Card>
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
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">My Position</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading position...</p>
        </div>
      </Card>
    )
  }

  return <PositionClient />
}
