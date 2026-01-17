import type {
  LiveMarketPosition,
} from '~/lib/hooks/rpc/use-live-market-positions'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Card } from '~/components/ui/card'
import { formatBigintShort, formatTimeAgo, formatUsd } from '~/lib/formatters'
import { useLiveMarketApy } from '~/lib/hooks/rpc/use-live-market-apy'
import {
  useLiveMarketPositions,
} from '~/lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'

// This component is the general position in the homepage

interface Portfolio {
  dailyUsd: number | undefined
  weightedAprPct: number | undefined
  totalAssets: bigint | undefined
  totalAssetsUsd: number | undefined
  totalAssetsSymbol: string | undefined
  totalAssetsDecimals: number | undefined
}

function PositionListItem({
  position,
  chainId,
  liveApy,
}: {
  position: LiveMarketPosition
  chainId: number
  liveApy?: number
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

  const apy = (liveApy ?? position.market.state.netSupplyApy) * 100 // Convert to percentage

  const { safuness } = useSafuness({
    chainId,
    collateralAddress: position.market.collateralAsset.address,
  })

  return (
    <Link to={`/market/${position.market.uniqueKey}/${chainId}`}>
      <li className="mb-4 p-3 sm:p-4 bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors duration-200 cursor-pointer">
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
              {apy.toFixed(2)}
              %
            </p>
            <p className={`text-sm ${safunessColorClass(safuness)}`}>
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
            {formatBigintShort(suppliedAssets, loanDecimals)}
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

  const markets = useMemo(() => (positions ?? []).map(p => p.market), [positions])
  const { apyByMarketKey } = useLiveMarketApy(markets)

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

  const portfolio = useMemo((): Portfolio => {
    if (!positions || !positions.length)
      return { dailyUsd: undefined, weightedAprPct: undefined, totalAssets: undefined, totalAssetsUsd: undefined, totalAssetsSymbol: undefined, totalAssetsDecimals: undefined }

    let totalAssets: bigint | undefined
    let totalAssetsSymbol: string | undefined
    let totalAssetsDecimals: number | undefined

    let totalPrincipalUsd = 0
    let totalDailyUsd = 0
    let totalAprWeighted = 0

    // Check if all positions have the same loan asset
    const firstLoanAssetAddress = positions[0]?.market.loanAsset.address
    const firstLoanAssetSymbol = positions[0]?.market.loanAsset.symbol
    const firstLoanAssetDecimals = positions[0]?.market.loanAsset.decimals ?? 18
    const allSameAsset = positions.every(p => p.market.loanAsset.address === firstLoanAssetAddress)

    if (allSameAsset && firstLoanAssetAddress) {
      totalAssets = 0n
      totalAssetsSymbol = firstLoanAssetSymbol
      totalAssetsDecimals = firstLoanAssetDecimals
    }

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
      const marketApy = apyByMarketKey[p.market.uniqueKey]?.apy ?? p.market.state.netSupplyApy ?? 0
      const dailyRate = Math.expm1(Math.log1p(marketApy) / 365)
      const dailyUsd = userPrincipalUsd * dailyRate

      totalPrincipalUsd += userPrincipalUsd
      totalDailyUsd += dailyUsd
      totalAprWeighted += userPrincipalUsd * marketApy

      // Calculate total assets if all positions have the same asset
      if (allSameAsset && totalAssets !== undefined) {
        const marketSupplyAssets = BigInt(p.market.state.supplyAssets)
        if (marketSupplyShares > 0n) {
          const suppliedAssets = (userSupplyShares * marketSupplyAssets) / marketSupplyShares
          totalAssets += suppliedAssets
        }
      }
    }

    const weightedAprPct = totalPrincipalUsd > 0 ? (totalAprWeighted / totalPrincipalUsd) * 100 : undefined
    return {
      dailyUsd: totalDailyUsd || undefined,
      weightedAprPct,
      totalAssets: totalAssets === 0n ? undefined : totalAssets,
      totalAssetsUsd: totalPrincipalUsd || undefined,
      totalAssetsSymbol,
      totalAssetsDecimals,
    }
  }, [positions, apyByMarketKey])

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
            <p className="text-xs text-gray-400">Weighted APY</p>
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
      <div className="py-6 px-4">
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
                        liveApy={apyByMarketKey[position.market.uniqueKey]?.apy}
                      />
                    ))}
                </ul>
              )}
        {(portfolio.totalAssetsUsd != null || (portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null)) && (
          <div
            className="
              flex flex-row justify-center items-center mx-4
              sm:justify-end
              gap-1 sm:gap-2
            "
          >
            <p className="text-xs text-gray-400 whitespace-nowrap">Total Assets</p>
            <p className="text-sm text-white whitespace-nowrap">
              {portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null
                ? (
                    <>
                      {formatBigintShort(portfolio.totalAssets, portfolio.totalAssetsDecimals)}
                      {' '}
                      {portfolio.totalAssetsSymbol}
                    </>
                  )
                : portfolio.totalAssetsUsd != null
                  ? formatUsd(portfolio.totalAssetsUsd)
                  : '—'}
            </p>
          </div>
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
