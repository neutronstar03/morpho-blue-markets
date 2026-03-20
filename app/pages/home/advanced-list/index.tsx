import type { MarketChainFilter, MarketData, MarketSide } from './shared'
import type { MorphoMarket, MarketFilters as TypeMarketFilters } from '~/lib/hooks/graphql/use-list-markets'
import type { LiveAprMarketInput } from '~/lib/hooks/rpc/use-live-market-apr'
import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { getSupportedChainName, supportedChainIdMap } from '~/lib/addresses'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { formatMarketSize, formatTimeAgo } from '~/lib/formatters'
import {
  MarketOrderBy,
  OrderDirection,
  useMarkets,
} from '~/lib/hooks/graphql/use-list-markets'
import { useLiveMarketApr } from '~/lib/hooks/rpc/use-live-market-apr'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { useLocalCollateralBlacklistVersion } from '~/lib/local-collateral-blacklist'
import { useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'
import { OpportunityRecap } from '~/pages/home/opportunity-recap'
import { MarketFilters } from './market-filters'
import { MarketTable } from './market-table'
import { getMarketSideColors } from './shared'

const CONFIG = {
  minSupplyApy: 0.09,
  maxSupplyApy: 10,
  minTvlUsd: 20000,
}

function buildWhereClause(
  aprType: string,
  comparison: string,
  aprValue: number,
  chainFilter: MarketChainFilter,
): TypeMarketFilters {
  const where: TypeMarketFilters = {
    supplyAssetsUsd_gte: CONFIG.minTvlUsd,
    supplyApy_lte: CONFIG.maxSupplyApy,
  }

  const aprValueDecimal = aprValue / 100

  if (aprType === 'supply') {
    if (comparison === '>')
      where.supplyApy_gte = Math.max(aprValueDecimal, CONFIG.minSupplyApy)
    else
      where.supplyApy_lte = Math.min(aprValueDecimal, CONFIG.maxSupplyApy)
  }
  else if (aprType === 'borrow') {
    if (comparison === '>')
      where.borrowApy_gte = aprValueDecimal
    else
      where.borrowApy_lte = aprValueDecimal
  }

  if (chainFilter !== 'ALL') {
    const filteredChainId = supportedChainIdMap.get(chainFilter)!
    where.chainId_in = [filteredChainId]
  }

  return where
}

function computeBeforeTarget(
  utilization: number,
  supplyAssetsUsd: number | null | undefined,
  borrowAssetsUsd: number | null | undefined,
  rateType: MarketSide,
): string {
  const supplyUsd = supplyAssetsUsd ?? 0
  const borrowUsd = borrowAssetsUsd ?? 0
  const targetUtilization = 0.9

  if (rateType === 'supply') {
    if (utilization > targetUtilization)
      return formatMarketSize((utilization - targetUtilization) * supplyUsd)
    return ''
  }

  if (utilization < targetUtilization) {
    const targetBorrowUsd = targetUtilization * supplyUsd
    const additionalBorrowable = targetBorrowUsd - borrowUsd
    return formatMarketSize(Math.max(0, additionalBorrowable))
  }
  return ''
}

export function AdvancedList() {
  const [aprType, setAprType] = useLocalStorage<MarketSide>('advanced-list:aprType', 'supply')
  const [comparison, setComparison] = useLocalStorage<'>' | '<'>('advanced-list:comparison', '>')
  const [aprValue, setAprValue] = useLocalStorage<number>('advanced-list:aprValue', 12)
  const [orderBy, setOrderBy] = useLocalStorage<MarketOrderBy>('advanced-list:orderBy', MarketOrderBy.NetSupplyApy)
  const [orderDirection, setOrderDirection] = useLocalStorage<OrderDirection>('advanced-list:orderDirection', OrderDirection.Desc)
  const [chainFilter, setChainFilter] = useLocalStorage<MarketChainFilter>('advanced-list:chainFilter', 'ALL')
  const [showOpportunityRecap, setShowOpportunityRecap] = useLocalStorage<boolean>('advanced-list:show-opportunity-recap', false)

  const where = useMemo(
    () => buildWhereClause(aprType, comparison, aprValue, chainFilter),
    [aprType, comparison, aprValue, chainFilter],
  )

  const {
    data: marketsData,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useMarkets({
    where,
    orderBy,
    orderDirection,
    staleTime: 5 * 60 * 1000,
  })

  const displayRateType: MarketSide
    = aprType === 'borrow' || orderBy === MarketOrderBy.NetBorrowApy
      ? 'borrow'
      : 'supply'

  const markets = useMemo(() => {
    if (!marketsData?.markets.items)
      return []

    return marketsData.markets.items.filter((market) => {
      if (market.collateralAsset == null || market.loanAsset == null)
        return false
      return true
    }).map((market: MorphoMarket): MarketData => ({
      id: market.uniqueKey,
      marketLabel: `${market.collateralAsset.symbol}/${market.loanAsset.symbol}`,
      chainId: Number(market.morphoBlue.chain.id),
      chainName: getSupportedChainName(market.morphoBlue.chain.id),
      marketSizeUsd: market.state.supplyAssetsUsd,
      beforeTarget: computeBeforeTarget(
        market.state.utilization,
        market.state.supplyAssetsUsd,
        market.state.borrowAssetsUsd,
        displayRateType,
      ),
      utilizationPct: `${(market.state.utilization * 100).toFixed(2)}%`,
      netSupplyApy: market.state.netSupplyApy,
      netBorrowApy: market.state.netBorrowApy,
      collateralAddress: market.collateralAsset.address,
      loanAddress: market.loanAsset.address,
      oracleAddress: market.oracleAddress || undefined,
      irmAddress: market.irmAddress,
      lltv: market.lltv || undefined,
      warnings: market.warnings,
    }))
  }, [displayRateType, marketsData])

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
    for (const m of markets) {
      const key = `${m.chainId}:${m.id.toLowerCase()}`
      out[key] = getMarketRisk({
        chainId: m.chainId,
        uniqueKey: m.id,
        loanAssetAddress: m.loanAddress,
        collateralAssetAddress: m.collateralAddress,
        loanAssetSymbol: m.marketLabel.split('/')[1]?.trim(),
        collateralAssetSymbol: m.marketLabel.split('/')[0]?.trim(),
        warnings: m.warnings,
      }).status
    }
    return out
  }, [blacklistVersion, decisionsVersion, localBlacklistVersion, markets, whitelistVersion])

  const visibleMarkets = useMemo(() => {
    return markets.filter((m) => {
      const key = `${m.chainId}:${m.id.toLowerCase()}`
      return riskStatusByKey[key] !== 'black'
    })
  }, [markets, riskStatusByKey])

  const { chainId: walletChainId } = useAccount()
  const selectedChainId = useMemo(() => {
    if (chainFilter === 'ALL')
      return undefined
    return supportedChainIdMap.get(chainFilter)
  }, [chainFilter])

  const liveChainId = selectedChainId ?? walletChainId ?? undefined
  const canComputeLiveApr = liveChainId != null && (selectedChainId == null || walletChainId === selectedChainId)

  const liveAprMarkets = useMemo<LiveAprMarketInput[]>(() => {
    if (!canComputeLiveApr || liveChainId == null)
      return []
    return markets
      .filter(m => m.chainId === liveChainId)
      .map(m => ({
        uniqueKey: m.id,
        irmAddress: m.irmAddress,
        oracleAddress: m.oracleAddress,
        lltv: m.lltv,
        loanAsset: { address: m.loanAddress, symbol: m.marketLabel.split('/')[1]?.trim() },
        collateralAsset: { address: m.collateralAddress, symbol: m.marketLabel.split('/')[0]?.trim() },
      }))
  }, [markets, canComputeLiveApr, liveChainId])

  const { aprByMarketKey } = useLiveMarketApr(liveAprMarkets)

  const [timeAgo, setTimeAgo] = useState('')
  const { handleRefresh, isRefreshing, isCooldown } = useRefreshWithCooldown(refetch)

  useEffect(() => {
    if (dataUpdatedAt) {
      setTimeAgo(formatTimeAgo(dataUpdatedAt))
      const interval = setInterval(() => {
        setTimeAgo(formatTimeAgo(dataUpdatedAt))
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [dataUpdatedAt])

  const colors = getMarketSideColors(displayRateType)

  return (
    <Card className={`border ${colors.border} ${colors.backgroundLight}`}>
      <div className={`p-4 border-b ${colors.border} flex items-center`}>
        <div className="flex flex-col items-start space-y-1 md:flex-row md:items-center md:space-x-4 md:space-y-0">
          <h2 className="text-xl font-bold text-white">Markets</h2>
          <span className="hidden md:inline-block text-sm text-gray-400 tabular-nums pr-4 w-32 text-right">
            {timeAgo || '—'}
          </span>
          <span className="md:hidden text-xs text-gray-500">
            {timeAgo || '—'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {displayRateType === 'supply' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowOpportunityRecap(prev => !prev)}
            >
              {showOpportunityRecap ? 'Hide recap' : 'Show recap'}
            </Button>
          )}
          <Button
            onClick={() => handleRefresh()}
            disabled={isRefreshing || isCooldown}
          >
            {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
          </Button>
        </div>
      </div>

      <MarketFilters
        aprType={aprType}
        setAprType={setAprType}
        comparison={comparison}
        setComparison={setComparison}
        aprValue={aprValue}
        setAprValue={setAprValue}
        orderBy={orderBy}
        setOrderBy={setOrderBy}
        orderDirection={orderDirection}
        setOrderDirection={setOrderDirection}
        chainFilter={chainFilter}
        setChainFilter={setChainFilter}
        rateType={displayRateType}
      />

      {displayRateType === 'supply' && showOpportunityRecap && (
        <div className={`border-b ${colors.border} p-4`}>
          <OpportunityRecap markets={visibleMarkets} />
        </div>
      )}

      <MarketTable
        markets={visibleMarkets}
        isLoading={isLoading}
        rateType={displayRateType}
        immediateAprByMarketKey={aprByMarketKey}
        canComputeLiveApr={canComputeLiveApr}
        liveChainId={liveChainId}
        hideChainColumn={chainFilter !== 'ALL'}
        riskStatusByKey={riskStatusByKey}
      />
    </Card>
  )
}
