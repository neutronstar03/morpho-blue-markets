import type { SupportedChain } from '~/lib/addresses'
import type { MorphoMarket, MarketFilters as TypeMarketFilters } from '~/lib/hooks/graphql/use-list-markets'
import type { LiveAprMarketInput } from '~/lib/hooks/rpc/use-live-market-apr'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
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
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'

const CONFIG = {
  minSupplyApy: 0.09, // 9% apy
  maxSupplyApy: 10, // 200% max apy
  minTvlUsd: 20000, // $20k minimum TVL
}

type MarketChainFilter = 'ALL' | SupportedChain

function buildWhereClause(
  aprType: string, // 'supply' or 'borrow'
  comparison: string, // '>' or '<'
  aprValue: number,
  chainFilter: MarketChainFilter,
): TypeMarketFilters {
  const where: TypeMarketFilters = {
    supplyAssetsUsd_gte: CONFIG.minTvlUsd,
    // this upper bound is configured because there are many unused markets with sky high APRs
    supplyApy_lte: CONFIG.maxSupplyApy,
  }

  const aprValueDecimal = aprValue / 100

  if (aprType === 'supply') {
    if (comparison === '>') {
      where.supplyApy_gte = Math.max(aprValueDecimal, CONFIG.minSupplyApy)
    }
    else {
      // '<'
      where.supplyApy_lte = Math.min(aprValueDecimal, CONFIG.maxSupplyApy)
    }
  }
  else if (aprType === 'borrow') {
    if (comparison === '>') {
      where.borrowApy_gte = aprValueDecimal
    }
    else {
      // '<'
      where.borrowApy_lte = aprValueDecimal
    }
  }

  if (chainFilter !== 'ALL') {
    const filteredChainId = supportedChainIdMap.get(chainFilter)!
    where.chainId_in = [filteredChainId]
  }

  return where
}

type Setter<T> = (value: T | ((prev: T) => T)) => void
type MarketSide = 'supply' | 'borrow'

/**
 * Returns color scheme classes based on market side.
 * Provides consistent dark orange theme for borrow mode and default gray for supply.
 */
function getMarketSideColors(side: MarketSide) {
  if (side === 'borrow') {
    return {
      background: 'bg-orange-950/50',
      backgroundLight: 'bg-orange-950/30',
      hover: 'hover:bg-orange-900/50',
      border: 'border-orange-800/30',
      rateText: 'text-orange-300',
    }
  }
  return {
    background: 'bg-gray-900/50',
    backgroundLight: 'bg-gray-800',
    hover: 'hover:bg-gray-700/50',
    border: 'border-gray-700',
    rateText: 'text-green-300',
  }
}

interface MarketData {
  id: string
  marketLabel: string
  chainId: number
  chainName: string
  marketSizeUsd: number | null | undefined
  beforeTarget: string
  utilizationPct: string
  netSupplyApy: number
  netBorrowApy: number
  collateralAddress: string
  loanAddress: string
  oracleAddress?: string
  irmAddress: string
  lltv?: string
  warnings?: Array<{ type: string, level: 'YELLOW' | 'RED' }>
}

interface MarketFiltersProps {
  aprType: MarketSide
  setAprType: Setter<MarketSide>
  comparison: '>' | '<'
  setComparison: Setter<'>' | '<'>
  aprValue: number
  setAprValue: Setter<number>
  orderBy: MarketOrderBy
  setOrderBy: Setter<MarketOrderBy>
  orderDirection: OrderDirection
  setOrderDirection: Setter<OrderDirection>
  chainFilter: MarketChainFilter
  setChainFilter: Setter<MarketChainFilter>
  rateType: MarketSide
}

function MarketFilters({
  aprType,
  setAprType,
  comparison,
  setComparison,
  aprValue,
  setAprValue,
  orderBy,
  setOrderBy,
  orderDirection,
  setOrderDirection,
  chainFilter,
  setChainFilter,
  rateType,
}: MarketFiltersProps) {
  const colors = getMarketSideColors(rateType)

  function onChangeDirection(value: MarketSide) {
    const prevMarketSide = aprType
    if (value !== prevMarketSide) {
      setOrderBy(value === 'supply' ? MarketOrderBy.NetSupplyApy : MarketOrderBy.NetBorrowApy)
      setOrderDirection(value === 'supply' ? OrderDirection.Desc : OrderDirection.Asc)
      setComparison(value === 'supply' ? '>' : '<')
      setAprValue(value === 'supply' ? 12 : 4)
    }
    setAprType(value)
  }

  return (
    <div className={`p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 ${colors.background} border-b ${colors.border}`}>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Chain:</span>
        <Select value={chainFilter} onValueChange={v => setChainFilter(v as MarketChainFilter)}>
          <SelectTrigger className="h-8 w-auto min-w-[5rem] bg-gray-700 border-gray-600 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL</SelectItem>
            {Array.from(supportedChainIdMap.keys()).map(chainName => (
              <SelectItem key={chainName} value={chainName}>{chainName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Filter:</span>
        <Select value={aprType} onValueChange={v => onChangeDirection(v as MarketSide)}>
          <SelectTrigger className="h-8 w-auto min-w-[6rem] bg-gray-700 border-gray-600 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="supply">Supply APY</SelectItem>
            <SelectItem value="borrow">Borrow APY</SelectItem>
          </SelectContent>
        </Select>
        <Select value={comparison} onValueChange={v => setComparison(v as '>' | '<')}>
          <SelectTrigger className="h-8 w-auto min-w-[3.75rem] justify-center bg-gray-700 border-gray-600 text-white text-base font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=">" className="text-base font-semibold justify-center">&gt;</SelectItem>
            <SelectItem value="<" className="text-base font-semibold justify-center">&lt;</SelectItem>
          </SelectContent>
        </Select>
        <input
          type="number"
          value={aprValue}
          onChange={e => setAprValue(Number(e.target.value))}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Value"
        />
        <span className="text-sm font-medium text-gray-300">%</span>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Order by:</span>
        <Select value={orderBy} onValueChange={v => setOrderBy(v as MarketOrderBy)}>
          <SelectTrigger className="h-8 w-auto min-w-[6rem] bg-gray-700 border-gray-600 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NetSupplyApy">Supply APY</SelectItem>
            <SelectItem value="NetBorrowApy">Borrow APY</SelectItem>
            <SelectItem value="SizeUsd">Size USD</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orderDirection} onValueChange={v => setOrderDirection(v as OrderDirection)}>
          <SelectTrigger className="h-8 w-auto min-w-[4rem] bg-gray-700 border-gray-600 text-white text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Desc">Desc</SelectItem>
            <SelectItem value="Asc">Asc</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

interface MarketTableProps {
  markets: MarketData[]
  isLoading: boolean
  rateType: MarketSide
  immediateAprByMarketKey: Record<string, { apr?: number, borrowApr?: number, isLive: boolean }>
  canComputeLiveApr: boolean
  liveChainId?: number
  hideChainColumn: boolean
  riskStatusByKey: Record<string, 'white' | 'blue' | 'yellow' | 'purple' | 'black' | undefined>
}

function MarketTable({
  markets,
  isLoading,
  rateType,
  immediateAprByMarketKey,
  canComputeLiveApr,
  liveChainId,
  hideChainColumn,
  riskStatusByKey,
}: MarketTableProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p className="text-white">Loading...</p>
      </div>
    )
  }
  const colors = getMarketSideColors(rateType)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className={colors.background}>
          <tr>
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
            {!hideChainColumn && (
              <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Chain</th>
            )}
            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Size $</th>
            <th scope="col" className="hidden sm:table-cell px-2 sm:px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">before 90%</th>
            <th scope="col" className="hidden sm:table-cell px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">usage %</th>
            <th scope="col" className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Recent APY</th>
            <th scope="col" className="px-2 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              <span className="sm:hidden">Imm APR</span>
              <span className="hidden sm:inline">Immediate APR</span>
            </th>
          </tr>
        </thead>
        <tbody className={`${colors.backgroundLight} divide-y divide-gray-700`}>
          {markets.map(market => (
            <tr
              key={market.id}
              className={`even:bg-white/[0.02] ${rateType === 'supply' ? 'hover:bg-gray-700/70' : 'hover:bg-orange-900/60'} transition-colors relative`}
            >
              <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/market/${market.id}/${market.chainId}`}
                    className="hover:opacity-90 transition-opacity"
                  >
                    <MarketRiskText status={riskStatusByKey[`${market.chainId}:${market.id.toLowerCase()}`]}>
                      {market.marketLabel}
                    </MarketRiskText>
                  </Link>
                  <a
                    href={morphoAppMarketUrl(market.chainName, market.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-blue-400 transition-colors relative z-10 flex items-center"
                    title="Open in Morpho official UI"
                  >
                    <LinkNewWindow className="w-5 h-5" />
                  </a>
                </div>
              </td>
              {!hideChainColumn && (
                <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-400">{market.chainName}</td>
              )}
              <td className="px-2 sm:px-3 py-4 whitespace-nowrap text-right text-sm text-white">{formatMarketSize(market.marketSizeUsd ?? undefined)}</td>
              <td className="hidden sm:table-cell px-2 sm:px-3 py-4 whitespace-nowrap text-right text-sm text-white">{market.beforeTarget}</td>
              <td className="hidden sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-white">{market.utilizationPct}</td>
              <td className={`px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {`${((rateType === 'supply' ? market.netSupplyApy : market.netBorrowApy) * 100).toFixed(2)}%`}
              </td>
              <td className={`px-2 sm:px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {(() => {
                  const entry = immediateAprByMarketKey[market.id]
                  const immediate = rateType === 'supply' ? entry?.apr : entry?.borrowApr
                  if (!canComputeLiveApr || liveChainId == null || market.chainId !== liveChainId)
                    return '—'
                  if (!entry?.isLive || immediate == null)
                    return '—'
                  return `${(immediate * 100).toFixed(2)}%`
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdvancedList() {
  // State for filters
  const [aprType, setAprType] = useLocalStorage<MarketSide>('advanced-list:aprType', 'supply')
  const [comparison, setComparison] = useLocalStorage<'>' | '<'>('advanced-list:comparison', '>')
  const [aprValue, setAprValue] = useLocalStorage<number>('advanced-list:aprValue', 12)
  const [orderBy, setOrderBy] = useLocalStorage<MarketOrderBy>('advanced-list:orderBy', MarketOrderBy.NetSupplyApy)
  const [orderDirection, setOrderDirection] = useLocalStorage<OrderDirection>('advanced-list:orderDirection', OrderDirection.Desc)
  const [chainFilter, setChainFilter] = useLocalStorage<MarketChainFilter>('advanced-list:chainFilter', 'ALL')

  const where = useMemo(
    () => buildWhereClause(aprType, comparison, aprValue, chainFilter),
    [aprType, comparison, aprValue, chainFilter],
  )

  const MARKETS_STALE_TIME = 5 * 60 * 1000 // 5 minute

  const {
    data: marketsData,
    isLoading,
    refetch,
    dataUpdatedAt,
  } = useMarkets({
    where,
    orderBy,
    orderDirection,
    staleTime: MARKETS_STALE_TIME,
  })

  // Determine which rate type to display based on filter or order by
  const displayRateType: MarketSide
    = aprType === 'borrow' || orderBy === MarketOrderBy.NetBorrowApy
      ? 'borrow'
      : 'supply'

  /**
   * Computes the beforeTarget value based on the display rate type.
   * - For 'supply': shows excess utilization above 90% (only when > 90%)
   * - For 'borrow': shows how much more can be borrowed before hitting 90% utilization (only when < 90%)
   */
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
      // For supply: show excess above 90%
      if (utilization > targetUtilization) {
        return formatMarketSize((utilization - targetUtilization) * supplyUsd)
      }
      return ''
    }
    else {
      // For borrow: show how much more can be borrowed before hitting 90%
      // Target borrow at 90% = 0.9 * supply, so additional borrowable = (0.9 * supply) - current borrow
      if (utilization < targetUtilization) {
        const targetBorrowUsd = targetUtilization * supplyUsd
        const additionalBorrowable = targetBorrowUsd - borrowUsd
        return formatMarketSize(Math.max(0, additionalBorrowable))
      }
      return ''
    }
  }

  const markets = useMemo(() => {
    if (!marketsData?.markets.items)
      return []

    return marketsData.markets.items.filter((market) => {
      if (market.collateralAsset == null || market.loanAsset == null)
        return false
      return true
    }).map((market: MorphoMarket) => ({
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
  }, [marketsData, displayRateType])

  const decisionsVersion = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()

  const riskStatusByKey = useMemo(() => {
    void decisionsVersion
    void whitelistVersion
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
  }, [decisionsVersion, markets, whitelistVersion])

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

  // State for last updated time
  const [timeAgo, setTimeAgo] = useState('')
  const { handleRefresh, isRefreshing, isCooldown } = useRefreshWithCooldown(refetch)

  useEffect(() => {
    if (dataUpdatedAt) {
      setTimeAgo(formatTimeAgo(dataUpdatedAt))
      const interval = setInterval(() => {
        setTimeAgo(formatTimeAgo(dataUpdatedAt))
      }, 5000) // update every 5 seconds
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
        <Button
          onClick={() => handleRefresh()}
          disabled={isRefreshing || isCooldown}
          className="ml-auto"
        >
          {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
        </Button>
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
