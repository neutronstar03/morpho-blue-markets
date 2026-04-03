import type { Portfolio } from './position-types'
import { Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { useNetworkContext } from '~/lib/contexts/network'
import { formatBigintShort, formatTimeAgo, formatUsd } from '~/lib/formatters'
import { useUserPositionsAcrossChains } from '~/lib/hooks/graphql/use-user-positions'
import { useLiveMarketApr } from '~/lib/hooks/rpc/use-live-market-apr'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { useLocalCollateralBlacklistVersion } from '~/lib/local-collateral-blacklist'
import { isMarketIdManuallyBlacklisted, useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'
import { PositionChainPills } from './position-chain-pills'
import { PositionGroups } from './position-groups'
import { getMarketSupplyUsd } from './position-utils'
import { usePositionChainPills } from './use-position-chain-pills'
import { usePositionGroups } from './use-position-groups'

// This component is the general position in the homepage

function PositionClient() {
  const { address: userAddress, isConnected, chain } = useAccount()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const { setRequiredChainId } = useNetworkContext()
  const {
    data: positions,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useLiveMarketPositions()
  const { data: crossChainPositions } = useUserPositionsAcrossChains(userAddress)

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

  const visiblePositions = useMemo(() => {
    if (!positions || !chain?.id)
      return positions ?? []
    // Manual market blacklist is the strong local hide list: exclude it from UI, totals, and pills.
    return positions.filter(position => !isMarketIdManuallyBlacklisted(position.market.uniqueKey, chain.id))
  }, [blacklistVersion, chain?.id, positions])

  const [timeAgo, setTimeAgo] = useState('')
  const [assetSummaryMode, setAssetSummaryMode] = useState<'total' | 'yearly'>('total')
  const { handleRefresh, isRefreshing, isCooldown } = useRefreshWithCooldown(refetch)

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setTimeAgo(formatTimeAgo(dataUpdatedAt))
      const interval = setInterval(() => {
        setTimeAgo(formatTimeAgo(dataUpdatedAt))
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [dataUpdatedAt])

  const portfolio = useMemo((): Portfolio => {
    if (!visiblePositions || !visiblePositions.length)
      return { dailyUsd: undefined, yearlyUsd: undefined, weightedAprPct: undefined, totalAssets: undefined, totalAssetsUsd: undefined, totalAssetsSymbol: undefined, totalAssetsDecimals: undefined }

    let totalAssets: bigint | undefined
    let totalAssetsSymbol: string | undefined
    let totalAssetsDecimals: number | undefined

    let totalPrincipalUsd = 0
    let totalDailyUsd = 0
    let totalAprWeighted = 0

    const firstLoanAssetAddress = visiblePositions[0]?.market.loanAsset.address
    const firstLoanAssetSymbol = visiblePositions[0]?.market.loanAsset.symbol
    const firstLoanAssetDecimals = visiblePositions[0]?.market.loanAsset.decimals ?? 18
    const allSameAsset = visiblePositions.every(p => p.market.loanAsset.address === firstLoanAssetAddress)

    if (allSameAsset && firstLoanAssetAddress) {
      totalAssets = 0n
      totalAssetsSymbol = firstLoanAssetSymbol
      totalAssetsDecimals = firstLoanAssetDecimals
    }

    for (const p of visiblePositions) {
      const marketSupplyShares = BigInt(p.market.state.supplyShares)
      const userSupplyShares = BigInt(p.userState.supplyShares)
      const marketSupplyUsd = getMarketSupplyUsd(p)

      if (marketSupplyShares === 0n || marketSupplyUsd == null)
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
  }, [visiblePositions, aprByMarketKey])

  const groupedPositions = usePositionGroups(visiblePositions, chain?.id, aprByMarketKey)
  const chainPills = usePositionChainPills(crossChainPositions, chain?.id)

  const handleChainPillClick = (chainId: number) => {
    // Cross-chain pills act like quick navigation: switch chain and bring the user back to the top summary.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setRequiredChainId(chainId)
    switchChain({ chainId })
  }

  if (!isConnected) {
    return (
      <Card className="mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Positions</h2>
        </div>
        <div className="p-6">
          <p className="text-gray-400">Please connect your wallet to see your positions.</p>
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
          <span className="hidden md:inline-block text-sm text-gray-400 tabular-nums pr-4 w-32 text-right">{timeAgo || '—'}</span>
          <span className="md:hidden text-xs text-gray-500">{timeAgo || '—'}</span>
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
          <Button onClick={() => handleRefresh()} disabled={isRefreshing || isCooldown}>
            {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
          </Button>
        </div>
      </div>
      <div className="py-4 sm:py-6 px-3 sm:px-4">
        {isLoading
          ? <p className="text-gray-400">Loading your positions...</p>
          : visiblePositions && visiblePositions.length === 0
            ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                    <Wallet className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-gray-300 font-medium mb-1">No open positions</p>
                  <p className="text-sm text-gray-500">Supply assets to a market to see your positions here.</p>
                </div>
              )
            : chain?.id && (
              <PositionGroups
                groups={groupedPositions}
                chainId={chain.id}
                portfolioTotalAssetsUsd={portfolio.totalAssetsUsd}
                aprByMarketKey={aprByMarketKey}
                riskStatusByKey={riskStatusByKey}
                summaryMode={assetSummaryMode}
                onToggleSummaryMode={() => setAssetSummaryMode(mode => mode === 'total' ? 'yearly' : 'total')}
              />
            )}
        {(chainPills.length > 0 || portfolio.totalAssetsUsd != null || (portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null)) && (
          <div className="mx-4 mt-6 flex flex-col gap-3 border-t border-gray-700/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <PositionChainPills
              items={chainPills}
              currentChainId={chain?.id}
              isSwitching={isSwitchingChain}
              onSelectChain={handleChainPillClick}
            />
            {(portfolio.totalAssetsUsd != null || (portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null)) && (
              <div className="flex flex-row items-center justify-center gap-1 sm:justify-end sm:gap-2">
                <p className="text-xs whitespace-nowrap text-gray-400">Total Assets</p>
                <p className="text-sm whitespace-nowrap text-white">
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
        )}
      </div>
    </Card>
  )
}

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
