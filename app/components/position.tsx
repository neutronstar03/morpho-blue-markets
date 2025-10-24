import type {
  LiveMarketPosition,
} from '../lib/hooks/rpc/use-live-market-positions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { formatAmountSpecific, formatTimeAgo, formatUsd } from '../lib/formatters'
import { useMarketQuery } from '../lib/hooks/graphql/use-market'
import {
  useLiveMarketPositions,
} from '../lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '../lib/hooks/use-is-client'
import { useRefreshWithCooldown } from '../lib/hooks/use-refresh-with-cooldown'
import { useTokenLiquidity } from '../lib/hooks/use-token-liquidity'
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

  // Liquidity for collateral token on this chain (aggregated), approximated 50% usable
  const { data: liquidityStr } = useTokenLiquidity({
    chainId,
    tokenAddress: position.market.collateralAsset.address,
  })
  const liquidityUsd = liquidityStr ? Number(liquidityStr) : undefined
  const effectiveLiquidityUsd = liquidityUsd != null ? liquidityUsd / 2 : undefined

  // Fetch full market to get USD supply for SAFUNESS computation
  const { data: fullMarket } = useMarketQuery(position.market.uniqueKey, chainId)
  const totalSupplyUsd = fullMarket?.state.supplyAssetsUsd

  const safuness
    = totalSupplyUsd && totalSupplyUsd > 0 && effectiveLiquidityUsd != null
      ? effectiveLiquidityUsd / totalSupplyUsd
      : undefined

  function safunessColor(ratio: number | undefined) {
    if (ratio == null)
      return 'text-gray-400'
    if (ratio >= 5)
      return 'text-green-400'
    if (ratio >= 3)
      return 'text-yellow-400'
    return 'text-red-400'
  }

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
            <p className={`text-sm ${safunessColor(safuness)}`}>
              SAFU:
              {' '}
              {safuness != null ? `${safuness.toFixed(2)}x` : '—'}
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

  const portfolio = useMemo(() => {
    if (!positions || !positions.length)
      return { dailyUsd: undefined as number | undefined, weightedAprPct: undefined as number | undefined }

    let totalPrincipalUsd = 0
    let totalDailyUsd = 0
    let totalAprWeighted = 0

    for (const p of positions) {
      const marketSupplyShares = BigInt(p.market.state.supplyShares)
      const userSupplyShares = BigInt(p.userState.supplyShares)
      const marketSupplyUsd = p.market.state.supplyAssetsUsd

      if (marketSupplyShares === 0n || typeof marketSupplyUsd !== 'number')
        continue

      const shareRatio = Number(userSupplyShares) / Number(marketSupplyShares)
      if (!Number.isFinite(shareRatio) || shareRatio <= 0)
        continue

      const userPrincipalUsd = marketSupplyUsd * shareRatio
      const dailyRate = (p.market.state.netSupplyApy || 0) / 365
      const dailyUsd = userPrincipalUsd * dailyRate

      totalPrincipalUsd += userPrincipalUsd
      totalDailyUsd += dailyUsd
      totalAprWeighted += userPrincipalUsd * (p.market.state.netSupplyApy || 0)
    }

    const weightedAprPct = totalPrincipalUsd > 0 ? (totalAprWeighted / totalPrincipalUsd) * 100 : undefined
    return { dailyUsd: totalDailyUsd || undefined, weightedAprPct }
  }, [positions])

  if (!isConnected) {
    return (
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Positions</h2>
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
          <h2 className="text-xl font-bold text-white">Positions</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading your positions...</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mb-8">
      <div className="p-4 border-b border-gray-700 flex items-center">
        <div className="flex flex-col items-start space-y-1 md:flex-row md:items-center md:space-x-4 md:space-y-0">
          <h2 className="text-xl font-bold text-white">Positions</h2>
          <span className="hidden md:inline-block text-sm text-gray-400 tabular-nums pr-4 w-32 text-right">
            {timeAgo || '—'}
          </span>
          <span className="md:hidden text-xs text-gray-500">
            {timeAgo || '—'}
          </span>
        </div>
        <div className="ml-auto flex items-center space-x-6">
          <div className="text-right">
            <p className="text-xs text-gray-400">Weighted APR</p>
            <p className="text-sm text-white">{portfolio.weightedAprPct != null ? `${portfolio.weightedAprPct.toFixed(2)}%` : '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Daily USD</p>
            <p className="text-sm text-white">{portfolio.dailyUsd != null ? formatUsd(portfolio.dailyUsd) : '—'}</p>
          </div>
          <button
            onClick={() => handleRefresh()}
            disabled={isRefreshing || isCooldown}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 cursor-pointer"
          >
            {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
          </button>
        </div>
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
          <h2 className="text-xl font-bold text-white">Positions</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Loading position...</p>
        </div>
      </Card>
    )
  }

  return <PositionClient />
}
