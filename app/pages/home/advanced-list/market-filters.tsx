import type { MarketChainFilter, MarketSide, Setter } from './shared'
import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { supportedChainIdMap } from '~/lib/addresses'
import { MarketOrderBy, OrderDirection } from '~/lib/hooks/graphql/use-list-markets'
import { getMarketSideColors } from './shared'

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
  searchQuery: string
  setSearchQuery: Setter<string>
}

export function MarketFilters({
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
  searchQuery,
  setSearchQuery,
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
    <div className={`p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 ${colors.background} border-b ${colors.border}`}>
      {/* Search */}
      <div className="relative w-full sm:w-auto sm:max-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search assets..."
          className="w-full h-9 bg-gray-700 border border-gray-600 rounded-md pl-9 pr-8 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-1">
        {/* Chain - always visible */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400 hidden sm:inline">Chain:</span>
          <Select value={chainFilter} onValueChange={v => setChainFilter(v as MarketChainFilter)}>
            <SelectTrigger className="h-9 w-auto min-w-[5rem] bg-gray-700 border-gray-600 text-white text-sm">
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

        {/* Desktop: inline filter group */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-400">Filter:</span>
          <Select value={aprType} onValueChange={v => onChangeDirection(v as MarketSide)}>
            <SelectTrigger className="h-9 w-auto min-w-[6rem] bg-gray-700 border-gray-600 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supply">Supply APY</SelectItem>
              <SelectItem value="borrow">Borrow APY</SelectItem>
            </SelectContent>
          </Select>
          <Select value={comparison} onValueChange={v => setComparison(v as '>' | '<')}>
            <SelectTrigger className="h-9 w-auto min-w-[3.75rem] justify-center bg-gray-700 border-gray-600 text-white text-base font-semibold">
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
            className="h-9 bg-gray-700 border border-gray-600 rounded-md px-3 text-sm text-white w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Value"
          />
          <span className="text-xs font-medium text-gray-400">%</span>
        </div>

        {/* Mobile: Filter Popover */}
        <div className="flex sm:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-gray-600 bg-gray-700 text-white hover:bg-gray-600">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-sm">Filters</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 bg-gray-800 border-gray-700" align="start">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-white">Filter</h4>
                <div className="flex items-center gap-2">
                  <Select value={aprType} onValueChange={v => onChangeDirection(v as MarketSide)}>
                    <SelectTrigger className="h-9 w-36 bg-gray-700 border-gray-600 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supply">Supply APY</SelectItem>
                      <SelectItem value="borrow">Borrow APY</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={comparison} onValueChange={v => setComparison(v as '>' | '<')}>
                    <SelectTrigger className="h-9 w-10 justify-center bg-gray-700 border-gray-600 text-white text-base font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">" className="text-base font-semibold justify-center">&gt;</SelectItem>
                      <SelectItem value="<" className="text-base font-semibold justify-center">&lt;</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={aprValue}
                      onChange={e => setAprValue(Number(e.target.value))}
                      className="h-9 w-16 bg-gray-700 border border-gray-600 rounded-md px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Value"
                    />
                    <span className="text-xs font-medium text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Desktop: inline sort group */}
        <div className="hidden sm:flex items-center gap-1.5 ml-auto">
          <span className="text-xs font-medium text-gray-400">Order by:</span>
          <Select value={orderBy} onValueChange={v => setOrderBy(v as MarketOrderBy)}>
            <SelectTrigger className="h-9 w-auto min-w-[6rem] bg-gray-700 border-gray-600 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NetSupplyApy">Supply APY</SelectItem>
              <SelectItem value="NetBorrowApy">Borrow APY</SelectItem>
              <SelectItem value="SizeUsd">Size USD</SelectItem>
            </SelectContent>
          </Select>
          <Select value={orderDirection} onValueChange={v => setOrderDirection(v as OrderDirection)}>
            <SelectTrigger className="h-9 w-auto min-w-[4rem] bg-gray-700 border-gray-600 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Desc">Desc</SelectItem>
              <SelectItem value="Asc">Asc</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mobile: Sort Popover */}
        <div className="flex sm:hidden ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-gray-600 bg-gray-700 text-white hover:bg-gray-600">
                <ArrowUpDown className="h-4 w-4" />
                <span className="text-sm">Sort</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-gray-800 border-gray-700" align="end">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-white">Order by</h4>
                <Select value={orderBy} onValueChange={v => setOrderBy(v as MarketOrderBy)}>
                  <SelectTrigger className="h-9 w-full bg-gray-700 border-gray-600 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NetSupplyApy">Supply APY</SelectItem>
                    <SelectItem value="NetBorrowApy">Borrow APY</SelectItem>
                    <SelectItem value="SizeUsd">Size USD</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={orderDirection} onValueChange={v => setOrderDirection(v as OrderDirection)}>
                  <SelectTrigger className="h-9 w-full bg-gray-700 border-gray-600 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Desc">Desc</SelectItem>
                    <SelectItem value="Asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
