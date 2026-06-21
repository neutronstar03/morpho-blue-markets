import type { Portfolio } from './position-types'
import type { MarketAprBySymbolMap } from '~/lib/default-market-apr'
import { RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { supportedChainMap } from '~/lib/addresses'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { formatTimeAgo, formatUsd } from '~/lib/formatters'
import { useUserPositionsAcrossChains } from '~/lib/hooks/graphql/use-user-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { configuredWagmiChainIds } from '~/lib/wagmi'
import { PositionNetworkSection } from './position-network-section'

interface ChainPortfolioState {
  portfolio: Portfolio
  positionCount: number
  isLoading: boolean
}

// This component is the general position in the homepage

function PositionClient() {
  const { address: userAddress, isConnected } = useAccount()
  const { viewingAddress, isViewingWallet } = useViewingWallet()
  const effectiveAddress = viewingAddress ?? userAddress
  const [marketAprBySymbol] = useLocalStorage<MarketAprBySymbolMap>('supply-apr-optimizer:market-apr-by-symbol', {})
  const [chainPortfolioById, setChainPortfolioById] = useState<Record<number, ChainPortfolioState>>({})
  const [liveRefreshKey, setLiveRefreshKey] = useState(0)
  const storage = typeof window === 'undefined' ? undefined : window.sessionStorage
  const [openChainIdsById, setOpenChainIdsById] = useLocalStorage<Record<string, boolean> | null>(
    `positions:open-networks:${effectiveAddress?.toLowerCase() ?? 'none'}`,
    null,
    { prefix: 'use-ss:', storage, sync: false },
  )
  const {
    data: crossChainPositions,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useUserPositionsAcrossChains(effectiveAddress)
  const handlePositionsRefresh = useCallback(async () => {
    await refetch()
    setLiveRefreshKey(key => key + 1)
  }, [refetch])
  const { handleRefresh, isRefreshing, isCooldown } = useRefreshWithCooldown(handlePositionsRefresh)

  const timeAgo = dataUpdatedAt > 0 ? formatTimeAgo(dataUpdatedAt) : ''
  const chainDiscoveryStats = useMemo(() => {
    const statsByChainId: Record<number, { positionCount: number }> = {}
    for (const position of crossChainPositions ?? []) {
      if (!supportedChainMap.has(position.chainId) || !configuredWagmiChainIds.has(position.chainId))
        continue
      const stats = statsByChainId[position.chainId] ?? { positionCount: 0 }
      stats.positionCount += 1
      statsByChainId[position.chainId] = stats
    }
    return statsByChainId
  }, [crossChainPositions])

  const networkChainIds = useMemo(() => {
    const seen = new Set<number>()
    for (const position of crossChainPositions ?? []) {
      if (!supportedChainMap.has(position.chainId) || !configuredWagmiChainIds.has(position.chainId))
        continue
      seen.add(position.chainId)
    }
    return [...seen.values()].sort((a, b) => {
      const aPortfolio = chainPortfolioById[a]
      const bPortfolio = chainPortfolioById[b]
      const aAssets = aPortfolio?.portfolio.totalAssetsUsd ?? -1
      const bAssets = bPortfolio?.portfolio.totalAssetsUsd ?? -1
      if (aAssets !== bAssets)
        return bAssets - aAssets

      const aPositions = aPortfolio?.positionCount ?? chainDiscoveryStats[a]?.positionCount ?? 0
      const bPositions = bPortfolio?.positionCount ?? chainDiscoveryStats[b]?.positionCount ?? 0
      if (aPositions !== bPositions)
        return bPositions - aPositions

      return (supportedChainMap.get(a) ?? '').localeCompare(supportedChainMap.get(b) ?? '')
    })
  }, [chainDiscoveryStats, chainPortfolioById, crossChainPositions])

  const handleChainPortfolioChange = useCallback((chainId: number, state: ChainPortfolioState) => {
    setChainPortfolioById(prev => ({ ...prev, [chainId]: state }))
  }, [])

  const handleChainOpenChange = useCallback((chainId: number, isOpen: boolean) => {
    setOpenChainIdsById(prev => ({ ...(prev ?? {}), [chainId]: isOpen }))
  }, [setOpenChainIdsById])

  const globalPortfolio = useMemo(() => {
    let positionCount = 0
    let totalAssetsUsd = 0
    let yearlyUsd = 0
    let dailyUsd = 0

    for (const chainId of networkChainIds) {
      const state = chainPortfolioById[chainId]
      if (!state)
        continue
      positionCount += state.positionCount
      totalAssetsUsd += state.portfolio.totalAssetsUsd ?? 0
      yearlyUsd += state.portfolio.yearlyUsd ?? 0
      dailyUsd += state.portfolio.dailyUsd ?? 0
    }

    return {
      positionCount,
      totalAssetsUsd: totalAssetsUsd || undefined,
      yearlyUsd: yearlyUsd || undefined,
      dailyUsd: dailyUsd || undefined,
      weightedAprPct: totalAssetsUsd > 0 ? (yearlyUsd / totalAssetsUsd) * 100 : undefined,
    }
  }, [chainPortfolioById, networkChainIds])

  if (!isConnected && !isViewingWallet) {
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
          <p className="text-gray-400">Discovering your positions...</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mb-8">
      <div className="border-b border-gray-700 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-start gap-3 sm:contents">
            <div className="min-w-0 flex-1 sm:flex sm:shrink-0 sm:items-baseline sm:gap-3">
              <span className="block text-xs uppercase tracking-wide text-gray-500 sm:text-sm">Total Assets</span>
              <span className="block truncate text-xl font-bold text-white sm:text-2xl">
                {globalPortfolio.totalAssetsUsd != null ? formatUsd(globalPortfolio.totalAssetsUsd) : '—'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500 sm:order-3 sm:ml-auto sm:text-sm">
              <span className="tabular-nums">{timeAgo || '—'}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleRefresh()}
                disabled={isRefreshing || isCooldown}
                className="h-8 px-2 sm:px-3"
                aria-label={isRefreshing ? 'Refreshing positions' : isCooldown ? 'Positions refreshed' : 'Refresh positions'}
                title={isRefreshing ? 'Refreshing positions' : isCooldown ? 'Positions refreshed' : 'Refresh positions'}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">{isRefreshing ? 'Refreshing' : isCooldown ? 'Refreshed' : 'Refresh'}</span>
              </Button>
            </div>
          </div>
          <div className="order-2 flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-2 sm:justify-start sm:gap-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            <div className="flex items-baseline gap-1.5 sm:block">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">APR</p>
              <p className="text-sm font-semibold text-white sm:text-base">{globalPortfolio.weightedAprPct != null ? `${globalPortfolio.weightedAprPct.toFixed(2)}%` : '—'}</p>
            </div>
            <div className="flex items-baseline gap-1.5 sm:block">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Daily USD</p>
              <p className="text-sm font-semibold text-white sm:text-base">{globalPortfolio.dailyUsd != null ? formatUsd(globalPortfolio.dailyUsd) : '—'}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="py-4 sm:py-6 px-3 sm:px-4">
        {isLoading
          ? <p className="text-gray-400">Discovering your positions...</p>
          : networkChainIds.length === 0
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
                <div className="space-y-3">
                  {networkChainIds.map((networkChainId, index) => (
                    <PositionNetworkSection
                      key={networkChainId}
                      chainId={networkChainId}
                      address={effectiveAddress as `0x${string}`}
                      isOpen={openChainIdsById == null ? index === 0 : !!openChainIdsById[networkChainId]}
                      onOpenChange={isOpen => handleChainOpenChange(networkChainId, isOpen)}
                      marketAprBySymbol={marketAprBySymbol}
                      refreshKey={liveRefreshKey}
                      onPortfolioChange={handleChainPortfolioChange}
                    />
                  ))}
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
