import { Fragment } from 'react/jsx-runtime'
import { formatMarketData } from '../lib/hooks/use-market'
import type { FrontendMarket } from '../lib/types'
import { MarketDisplay } from './market-display'

interface MarketListProps {
  markets: FrontendMarket[]
  selectedMarketId: string | null
  onMarketSelect: (marketId: string | null) => void
}

export function MarketList({
  markets,
  selectedMarketId,
  onMarketSelect,
}: MarketListProps) {
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Curated Markets</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900/50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Market
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Chain
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Market Size
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Supply APY
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Total Borrow
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider"
              >
                Borrow APY
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {markets.map((market) => {
              const formatted = formatMarketData(market)
              const isSelected = selectedMarketId === market.id
              return (
                <Fragment key={market.id}>
                  <tr
                    onClick={() =>
                      onMarketSelect(isSelected ? null : market.id!)
                    }
                    className={`cursor-pointer hover:bg-gray-700/50 transition-colors ${
                      isSelected ? 'bg-blue-900/30' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {formatted.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-400">
                        {formatted.chainName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-white">
                        {formatted.tvlFormatted}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-green-300">
                        {formatted.supplyApyFormatted}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-white">
                        {formatted.totalBorrowFormatted}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-orange-300">
                        {formatted.borrowApyFormatted}
                      </div>
                    </td>
                  </tr>
                  {isSelected && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="p-4 bg-gray-900/50">
                          <MarketDisplay market={formatted} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
