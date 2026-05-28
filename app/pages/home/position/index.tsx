import type { Portfolio } from './position-types'
import type { MarketAprBySymbolMap } from '~/lib/default-market-apr'
import { Wallet } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { supportedChainMap } from '~/lib/addresses'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { formatTimeAgo, formatUsd } from '~/lib/formatters'
import { useUserPositionsAcrossChains } from '~/lib/hooks/graphql/use-user-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { configuredWagmiChainIds } from '~/lib/wagmi'
import { PositionNetworkSection } from './position-network-section'

interface ChainPortfolioState {
  portfolio: Portfolio
  positionCount: number
  isLoading: boolean
}

// This component is the general position in the homepage

function PositionClient() {
  const { address: userAddress, isConnected, chain } = useAccount()
  const walletChainId = useChainId()
  const { viewingAddress, isViewingWallet } = useViewingWallet()
  const effectiveAddress = viewingAddress ?? userAddress
  const chainId = chain?.id ?? walletChainId
  const [marketAprBySymbol] = useLocalStorage<MarketAprBySymbolMap>('supply-apr-optimizer:market-apr-by-symbol', {})
  const [chainPortfolioById, setChainPortfolioById] = useState<Record<number, ChainPortfolioState>>({})
  const {
    data: crossChainPositions,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useUserPositionsAcrossChains(effectiveAddress)

  const timeAgo = dataUpdatedAt > 0 ? formatTimeAgo(dataUpdatedAt) : ''
  const networkChainIds = useMemo(() => {
    const seen = new Set<number>()
    for (const position of crossChainPositions ?? []) {
      if (!supportedChainMap.has(position.chainId) || !configuredWagmiChainIds.has(position.chainId))
        continue
      seen.add(position.chainId)
    }
    return [...seen.values()].sort((a, b) => {
      if (a === chainId)
        return -1
      if (b === chainId)
        return 1
      return (supportedChainMap.get(a) ?? '').localeCompare(supportedChainMap.get(b) ?? '')
    })
  }, [chainId, crossChainPositions])

  const handleChainPortfolioChange = useCallback((chainId: number, state: ChainPortfolioState) => {
    setChainPortfolioById(prev => ({ ...prev, [chainId]: state }))
  }, [])

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
      <div className="p-4 border-b border-gray-700 flex items-center">
        <div className="flex flex-col items-start space-y-1 md:flex-row md:items-center md:space-x-4 md:space-y-0">
          <h2 className="text-xl font-bold text-white">Positions</h2>
          <span className="hidden md:inline-block text-sm text-gray-400 tabular-nums pr-4 w-32 text-right">{timeAgo || '—'}</span>
          <span className="md:hidden text-xs text-gray-500">{timeAgo || '—'}</span>
        </div>
        <div className="ml-auto flex items-center space-x-3 sm:space-x-6">
          <div className="text-right">
            <p className="text-xs text-gray-400">Networks</p>
            <p className="text-xs sm:text-sm text-white">{networkChainIds.length || '—'}</p>
          </div>
          <Button onClick={() => void refetch()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
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
                  <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-2.5 sm:px-4">
                    <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4 sm:gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Total Assets</p>
                        <p className="text-xs font-semibold text-white sm:text-sm">{globalPortfolio.totalAssetsUsd != null ? formatUsd(globalPortfolio.totalAssetsUsd) : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Weighted APR</p>
                        <p className="text-xs font-semibold text-white sm:text-sm">{globalPortfolio.weightedAprPct != null ? `${globalPortfolio.weightedAprPct.toFixed(2)}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Daily USD</p>
                        <p className="text-xs font-semibold text-white sm:text-sm">{globalPortfolio.dailyUsd != null ? formatUsd(globalPortfolio.dailyUsd) : '—'}</p>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Positions</p>
                        <p className="text-sm font-semibold text-white">{globalPortfolio.positionCount || '—'}</p>
                      </div>
                    </div>
                  </div>
                  {networkChainIds.map((networkChainId, index) => (
                    <PositionNetworkSection
                      key={networkChainId}
                      chainId={networkChainId}
                      address={effectiveAddress as `0x${string}`}
                      defaultOpen={networkChainId === chainId || index === 0}
                      marketAprBySymbol={marketAprBySymbol}
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
