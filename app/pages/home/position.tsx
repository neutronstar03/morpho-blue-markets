import type {
  LiveMarketPosition,
} from '~/lib/hooks/rpc/use-live-market-positions'
import { Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Badge, BadgeLabel } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { getSupportedChainName } from '~/lib/addresses'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { formatBigintShort, formatTimeAgo, formatUsd } from '~/lib/formatters'
import { useLiveMarketApr } from '~/lib/hooks/rpc/use-live-market-apr'
import {
  useLiveMarketPositions,
} from '~/lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'
import { useLocalCollateralBlacklistVersion } from '~/lib/local-collateral-blacklist'
import { useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'

// This component is the general position in the homepage

interface Portfolio {
  dailyUsd: number | undefined
  yearlyUsd: number | undefined
  weightedAprPct: number | undefined
  totalAssets: bigint | undefined
  totalAssetsUsd: number | undefined
  totalAssetsSymbol: string | undefined
  totalAssetsDecimals: number | undefined
}

function PositionListItem({
  position,
  chainId,
  liveApr,
  totalYearlyUsd,
  riskStatus,
}: {
  position: LiveMarketPosition
  chainId: number
  liveApr?: number
  totalYearlyUsd?: number
  riskStatus?: 'white' | 'blue' | 'yellow' | 'purple' | 'black'
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

  const apr = liveApr != null ? liveApr * 100 : undefined // Convert to percentage

  const yearlyUsd = useMemo(() => {
    if (liveApr == null)
      return undefined
    const marketSupplyUsd = position.market.state.supplyAssetsUsd
    if (typeof marketSupplyUsd !== 'number')
      return undefined
    if (marketSupplyShares === 0n)
      return undefined
    const shareRatio = Number(userSupplyShares) / Number(marketSupplyShares)
    if (!Number.isFinite(shareRatio) || shareRatio <= 0)
      return undefined
    const userPrincipalUsd = marketSupplyUsd * shareRatio
    return userPrincipalUsd * liveApr
  }, [liveApr, marketSupplyShares, position.market.state.supplyAssetsUsd, userSupplyShares])

  const contributionPct = useMemo(() => {
    if (totalYearlyUsd == null || totalYearlyUsd <= 0 || yearlyUsd == null)
      return undefined
    return (yearlyUsd / totalYearlyUsd) * 100
  }, [totalYearlyUsd, yearlyUsd])

  const { safuness } = useSafuness({
    chainId,
    collateralAddress: position.market.collateralAsset.address,
  })

  return (
    <Link to={`/market/${position.market.uniqueKey}/${chainId}`}>
      <li className="py-3 px-2.5 sm:p-4 bg-gray-900/50 border border-gray-800 rounded-lg hover:bg-gray-900 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <div className="flex flex-row justify-between items-center">
          <div className="space-y-0.5 sm:space-y-1">
            <div>
              <MarketRiskText status={riskStatus} size="xl" className="font-semibold">
                {`${position.market.collateralAsset.symbol} / ${position.market.loanAsset.symbol}`}
              </MarketRiskText>
              <p className="text-xs text-gray-500">
                {getSupportedChainName(chainId)}
              </p>
            </div>

            <p className="text-sm sm:text-base text-gray-300">
              <span className="text-xs sm:text-sm text-gray-400">Supply:</span>
              {' '}
              {formatBigintShort(suppliedAssets, loanDecimals)}
              {' '}
              {position.market.loanAsset.symbol}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Badge variant="success" size="sm">
              <BadgeLabel>APR</BadgeLabel>
              {apr != null ? `${apr.toFixed(2)}%` : '—'}
            </Badge>
            <Badge variant="neutral" size="sm" className={safunessColorClass(safuness)}>
              <BadgeLabel>Safety</BadgeLabel>
              {safuness != null ? `${safuness.toFixed(2)}x` : '—'}
            </Badge>
            <Badge variant="subtle" size="sm">
              <span>Weight</span>
              <span className="text-gray-400">{contributionPct != null ? `${contributionPct.toFixed(1)}%` : '—'}</span>
            </Badge>
          </div>
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
  const { aprByMarketKey } = useLiveMarketApr(markets)

  const decisionsVersion = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const localBlacklistVersion = useLocalCollateralBlacklistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  const riskStatusByKey = useMemo(() => {
    void decisionsVersion
    void whitelistVersion
    void localBlacklistVersion
    void blacklistVersion
    const out: Record<string, 'white' | 'blue' | 'yellow' | 'purple' | 'black' | undefined> = {}
    if (!chain?.id)
      return out
    for (const p of (positions ?? [])) {
      const key = `${chain.id}:${p.market.uniqueKey.toLowerCase()}`
      out[key] = getMarketRisk({
        chainId: chain.id,
        uniqueKey: p.market.uniqueKey,
        loanAssetAddress: p.market.loanAsset.address,
        collateralAssetAddress: p.market.collateralAsset.address,
        loanAssetSymbol: p.market.loanAsset.symbol,
        collateralAssetSymbol: p.market.collateralAsset.symbol,
        warnings: p.market.warnings,
      }).status
    }
    return out
  }, [blacklistVersion, chain?.id, decisionsVersion, localBlacklistVersion, positions, whitelistVersion])

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
      return { dailyUsd: undefined, yearlyUsd: undefined, weightedAprPct: undefined, totalAssets: undefined, totalAssetsUsd: undefined, totalAssetsSymbol: undefined, totalAssetsDecimals: undefined }

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
      const marketApr = aprByMarketKey[p.market.uniqueKey]?.apr
      if (marketApr == null)
        continue
      const dailyRate = marketApr / 365
      const dailyUsd = userPrincipalUsd * dailyRate

      totalPrincipalUsd += userPrincipalUsd
      totalDailyUsd += dailyUsd
      totalAprWeighted += userPrincipalUsd * marketApr

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
      yearlyUsd: totalAprWeighted || undefined,
      weightedAprPct,
      totalAssets: totalAssets === 0n ? undefined : totalAssets,
      totalAssetsUsd: totalPrincipalUsd || undefined,
      totalAssetsSymbol,
      totalAssetsDecimals,
    }
  }, [positions, aprByMarketKey])

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
        <div className="ml-auto flex items-center space-x-3 sm:space-x-6">
          <div className="text-right">
            <p className="text-xs text-gray-400">Weighted APR</p>
            <p className="text-xs sm:text-sm text-white">{portfolio.weightedAprPct != null ? `${portfolio.weightedAprPct.toFixed(2)}%` : '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Daily USD</p>
            <p className="text-xs sm:text-sm text-white">{portfolio.dailyUsd != null ? formatUsd(portfolio.dailyUsd) : '—'}</p>
          </div>
          <Button
            onClick={() => handleRefresh()}
            disabled={isRefreshing || isCooldown}
          >
            {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
          </Button>
        </div>
      </div>
      <div className="py-4 sm:py-6 px-3 sm:px-4">
        {isLoading
          ? (
              <p className="text-gray-400">Loading your positions...</p>
            )
          : positions && positions.length === 0
            ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                    <Wallet className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-gray-300 font-medium mb-1">No open positions</p>
                  <p className="text-sm text-gray-500">Supply assets to a market to see your positions here.</p>
                </div>
              )
            : (
                <ul className="space-y-2 sm:space-y-3">
                  {positions
                    && chain?.id
                    && positions.map((position: LiveMarketPosition) => {
                      const key = `${chain.id}:${position.market.uniqueKey.toLowerCase()}`
                      const riskStatus = riskStatusByKey[key]
                      return (
                        <PositionListItem
                          key={position.market.uniqueKey}
                          position={position}
                          chainId={chain.id}
                          liveApr={aprByMarketKey[position.market.uniqueKey]?.apr}
                          totalYearlyUsd={portfolio.yearlyUsd}
                          riskStatus={riskStatus}
                        />
                      )
                    })}
                </ul>
              )}
        {(portfolio.totalAssetsUsd != null || (portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null)) && (
          <div
            className="
              flex flex-row justify-center items-center mx-4 mt-6 pt-4 border-t border-gray-700/50
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
