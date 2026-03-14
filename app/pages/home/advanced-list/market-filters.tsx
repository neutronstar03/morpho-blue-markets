import type { MarketChainFilter, MarketSide, Setter } from './shared'
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
