import type {
  MorphoMarket,
  MarketFilters as TypeMarketFilters,
} from '~/lib/hooks/use-list-markets'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MarketOrderBy,
  OrderDirection,
  useMarkets,
} from '~/lib/hooks/use-list-markets'
import { formatTimeAgo } from '~/lib/time'

const CONFIG = {
  minSupplyApy: 0.09, // 9% apr
  maxSupplyApy: 2, // 200% max apr
  minTvlUsd: 50000, // $50k minimum TVL
}

const CHAIN_NAMES: { [key: number]: string } = {
  1: 'Ethereum',
  8453: 'Base',
  42161: 'Arbitrum',
  137: 'Polygon',
  999: 'HyperEVM',
}

function buildWhereClause(
  aprType: string,
  comparison: string,
  aprValue: number,
): TypeMarketFilters {
  const where: TypeMarketFilters = {
    supplyAssetsUsd_gte: CONFIG.minTvlUsd,
    supplyApy_gte: CONFIG.minSupplyApy,
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

  return where
}

// This is a placeholder type. We'll define the exact fields later.
interface MarketData {
  id: string
  market: string
  chainId: number
  chainName: string
  marketSize: string
  utilization: string
  supplyApr: string
  supplyApr1d: string
  supplyApr7d: string
  whitelisted: boolean
}

interface MarketFiltersProps {
  aprType: string
  setAprType: (value: string) => void
  comparison: string
  setComparison: (value: string) => void
  aprValue: number
  setAprValue: (value: number) => void
  orderBy: string
  setOrderBy: (value: string) => void
  orderDirection: string
  setOrderDirection: (value: string) => void
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
}: MarketFiltersProps) {
  return (
    <div className="p-4 flex flex-wrap items-center gap-4 bg-gray-900/50 border-b border-gray-700">
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-gray-300">Filter:</span>
        <select
          value={aprType}
          onChange={e => setAprType(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="supply">Supply APR</option>
          <option value="borrow">Borrow APR</option>
        </select>
        <select
          value={comparison}
          onChange={e => setComparison(e.target.value)}
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
          onChange={e => setOrderBy(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-md px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Lltv">Lltv</option>
          <option value="BorrowAssetsUsd">BorrowAssetsUsd</option>
          <option value="SupplyAssetsUsd">SupplyAssetsUsd</option>
          <option value="SupplyShares">SupplyShares</option>
          <option value="Utilization">Utilization</option>
          <option value="RateAtUTarget">RateAtUTarget</option>
          <option value="ApyAtTarget">ApyAtTarget</option>
          <option value="SupplyApy">SupplyApy</option>
          <option value="NetSupplyApy">NetSupplyApy</option>
          <option value="BorrowApy">BorrowApy</option>
          <option value="NetBorrowApy">NetBorrowApy</option>
          <option value="TotalLiquidityUsd">TotalLiquidityUsd</option>
          <option value="AvgBorrowApy">AvgBorrowApy</option>
          <option value="AvgNetBorrowApy">AvgNetBorrowApy</option>
          <option value="DailyBorrowApy">DailyBorrowApy</option>
          <option value="DailyNetBorrowApy">DailyNetBorrowApy</option>
          <option value="SizeUsd">SizeUsd</option>
        </select>
        <select
          value={orderDirection}
          onChange={e =>
            setOrderDirection(e.target.value as OrderDirection)}
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
}

function MarketTable({ markets, isLoading }: MarketTableProps) {
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p className="text-white">Loading...</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-900/50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Chain Name</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Market Size</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Utilization %</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Supply APR</th>
            <th scope="col" className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Supply APR 1d</th>
            <th scope="col" className="hidden lg:table-cell px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Supply APR 7d</th>
            <th scope="col" className="hidden md:table-cell px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Whitelisted</th>
          </tr>
        </thead>
        <tbody className="bg-gray-800 divide-y divide-gray-700">
          {markets.map(market => (
            <tr
              key={market.id}
              className="hover:bg-gray-700/50 transition-colors cursor-pointer"
              onClick={() => navigate(`/market/${market.id}/${market.chainId}`)}
            >
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{market.market}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{market.chainName}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">{market.marketSize}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-white">{market.utilization}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-300">{market.supplyApr}</td>
              <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-right text-sm text-green-300">{market.supplyApr1d}</td>
              <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap text-right text-sm text-green-300">{market.supplyApr7d}</td>
              <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-center text-sm">
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
  const [aprType, setAprType] = useState('supply')
  const [comparison, setComparison] = useState('>')
  const [aprValue, setAprValue] = useState(12)
  const [orderBy, setOrderBy] = useState<MarketOrderBy>(MarketOrderBy.NetSupplyApy)
  const [orderDirection, setOrderDirection] = useState<OrderDirection>(OrderDirection.Desc)

  const where = useMemo(
    () => buildWhereClause(aprType, comparison, aprValue),
    [aprType, comparison, aprValue],
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

  const markets = useMemo(() => {
    if (!marketsData?.markets.items)
      return []

    return marketsData.markets.items.map((market: MorphoMarket) => ({
      id: market.uniqueKey,
      market: `${market.collateralAsset.symbol}/${market.loanAsset.symbol}`,
      chainId: Number(market.morphoBlue.chain.id),
      chainName: CHAIN_NAMES[Number(market.morphoBlue.chain.id)] ?? 'Unknown',
      marketSize: `$${(market.state.supplyAssetsUsd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      utilization: `${(market.state.utilization * 100).toFixed(2)}%`,
      supplyApr: `${(market.state.netSupplyApy * 100).toFixed(2)}%`,
      supplyApr1d: `${(market.state.dailyNetSupplyApy * 100).toFixed(2)}%`,
      supplyApr7d: `${(market.state.weeklyNetSupplyApy * 100).toFixed(2)}%`,
      whitelisted: market.whitelisted,
    }))
  }, [marketsData])

  // State for last updated time
  const [timeAgo, setTimeAgo] = useState('')

  useEffect(() => {
    if (dataUpdatedAt) {
      setTimeAgo(formatTimeAgo(dataUpdatedAt))
      const interval = setInterval(() => {
        setTimeAgo(formatTimeAgo(dataUpdatedAt))
      }, 5000) // update every 5 seconds
      return () => clearInterval(interval)
    }
  }, [dataUpdatedAt])

  const handleRefresh = () => {
    refetch()
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Advanced Markets</h2>
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
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 cursor-pointer"
        >
          Refresh
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
        setOrderBy={setOrderBy as (value: string) => void}
        orderDirection={orderDirection}
        setOrderDirection={setOrderDirection as (value: string) => void}
      />

      <MarketTable markets={markets} isLoading={isLoading} />
    </div>
  )
}
