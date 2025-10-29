import type { SupportedChain } from '~/lib/addresses'
import type { MorphoMarket, MarketFilters as TypeMarketFilters } from '~/lib/hooks/graphql/use-list-markets'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { getSupportedChainName, supportedChainIdMap, supportedChains } from '~/lib/addresses'
import { formatMarketSize, formatTimeAgo } from '~/lib/formatters'
import {
  MarketOrderBy,
  OrderDirection,
  useMarkets,
} from '~/lib/hooks/graphql/use-list-markets'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useRefreshWithCooldown } from '~/lib/hooks/use-refresh-with-cooldown'
import { Card } from './ui/card'

const CONFIG = {
  minSupplyApy: 0.09, // 9% apr
  maxSupplyApy: 10, // 200% max apr
  minTvlUsd: 20000, // $20k minimum TVL
}

const CHAIN_LABELS: Record<SupportedChain, string> = {
  Ethereum: 'Ethereum',
  Base: 'Base',
  Arbitrum: 'Arbitrum',
  Polygon: 'Polygon',
  Hyperliquid: 'Hyperliquid',
  Unichain: 'Unichain',
  Katana: 'Katana',
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
  market: string
  chainId: number
  chainName: string
  marketSize: string
  beforeTarget: string
  utilization: string
  supplyApr: string
  supplyApr1d: string
  supplyApr7d: string
  borrowApr: string
  borrowApr1d: string
  borrowApr7d: string
  whitelisted: boolean
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
    <div className={`p-4 flex flex-wrap items-center gap-4 ${colors.background} border-b ${colors.border}`}>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Filter by Chain:</span>
        <select
          value={chainFilter}
          onChange={e => setChainFilter(e.target.value as MarketChainFilter)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">ALL</option>
          {supportedChains.map(chain => (
            <option key={chain} value={chain}>{CHAIN_LABELS[chain]}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Filter:</span>
        <select
          value={aprType}
          onChange={e => onChangeDirection(e.target.value as MarketSide)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="supply">Supply APR</option>
          <option value="borrow">Borrow APR</option>
        </select>
        <select
          value={comparison}
          onChange={e => setComparison(e.target.value as '>' | '<')}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value=">">{'>'}</option>
          <option value="<">{'<'}</option>
        </select>
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
        <select
          value={orderBy}
          onChange={e => setOrderBy(e.target.value as MarketOrderBy)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="NetSupplyApy">Supply APY</option>
          <option value="NetBorrowApy">Borrow APY</option>
          <option value="SizeUsd">Size USD</option>
        </select>
        <select
          value={orderDirection}
          onChange={e => setOrderDirection(e.target.value as OrderDirection)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Desc">Desc</option>
          <option value="Asc">Asc</option>
        </select>
      </div>
    </div>
  )
}

interface MarketTableProps {
  markets: MarketData[]
  isLoading: boolean
  rateType: MarketSide
}

function MarketTable({ markets, isLoading, rateType }: MarketTableProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p className="text-white">Loading...</p>
      </div>
    )
  }
  const rateLabel = rateType === 'supply' ? 'Supply' : 'Borrow'
  const colors = getMarketSideColors(rateType)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className={colors.background}>
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Chain</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Size $</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">before 90%</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">usage %</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              {rateLabel}
              {' '}
              APR
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              {rateLabel}
              {' '}
              APR 1d
            </th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              {rateLabel}
              {' '}
              APR 7d
            </th>
            <th scope="col" className="hidden lg:table-cell px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Whitelisted</th>
          </tr>
        </thead>
        <tbody className={`${colors.backgroundLight} divide-y divide-gray-700`}>
          {markets.map(market => (
            <tr
              key={market.id}
              className={`${colors.hover} transition-colors relative`}
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/market/${market.id}/${market.chainId}`}
                    className="hover:text-blue-400 transition-colors"
                  >
                    {market.market}
                  </Link>
                  <a
                    href={`https://app.morpho.org/${market.chainName.toLowerCase()}/market/${market.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-blue-400 transition-colors relative z-10 flex items-center"
                    title="Open in Morpho official UI"
                  >
                    <LinkNewWindow className="w-5 h-5" />
                  </a>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{market.chainName}</td>
              <td className="px-3 py-4 whitespace-nowrap text-right text-sm text-white">{market.marketSize}</td>
              <td className="px-3 py-4 whitespace-nowrap text-right text-sm text-white">{market.beforeTarget}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">{market.utilization}</td>
              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {rateType === 'supply' ? market.supplyApr : market.borrowApr}
              </td>
              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {rateType === 'supply' ? market.supplyApr1d : market.borrowApr1d}
              </td>
              <td className={`px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {rateType === 'supply' ? market.supplyApr7d : market.borrowApr7d}
              </td>
              <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-center text-sm">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    market.whitelisted
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {market.whitelisted ? 'Yes' : 'No'}
                </span>
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
      market: `${market.collateralAsset.symbol}/${market.loanAsset.symbol}`,
      chainId: Number(market.morphoBlue.chain.id),
      chainName: getSupportedChainName(market.morphoBlue.chain.id),
      marketSize: formatMarketSize(market.state.supplyAssetsUsd),
      beforeTarget: computeBeforeTarget(
        market.state.utilization,
        market.state.supplyAssetsUsd,
        market.state.borrowAssetsUsd,
        displayRateType,
      ),
      utilization: `${(market.state.utilization * 100).toFixed(2)}%`,
      supplyApr: `${(market.state.netSupplyApy * 100).toFixed(2)}%`,
      supplyApr1d: `${(market.state.dailyNetSupplyApy * 100).toFixed(2)}%`,
      supplyApr7d: `${(market.state.weeklyNetSupplyApy * 100).toFixed(2)}%`,
      borrowApr: `${(market.state.netBorrowApy * 100).toFixed(2)}%`,
      borrowApr1d: `${(market.state.dailyNetBorrowApy * 100).toFixed(2)}%`,
      borrowApr7d: `${(market.state.weeklyNetBorrowApy * 100).toFixed(2)}%`,
      whitelisted: market.whitelisted,
    }))
  }, [marketsData, displayRateType])

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
        <button
          onClick={() => handleRefresh()}
          disabled={isRefreshing || isCooldown}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 cursor-pointer"
        >
          {isRefreshing ? 'Refreshing…' : isCooldown ? 'Refreshed' : 'Refresh'}
        </button>
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

      <MarketTable markets={markets} isLoading={isLoading} rateType={displayRateType} />
    </Card>
  )
}
