import { formatMarketData } from '../lib/hooks/use-market'
import type { Market } from '../lib/types'

interface MarketListProps {
  markets: Market[]
  selectedMarketId: string | null
  onMarketSelect: (marketId: string) => void
}

export function MarketList({ markets, selectedMarketId, onMarketSelect }: MarketListProps) {
  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Curated Markets</h2>
      </div>
      <div className="overflow-y-auto h-[calc(100vh-250px)]">
        <ul className="divide-y divide-gray-700">
          {markets.map((market) => {
            const formatted = formatMarketData(market)
            return (
              <li
                key={market.id}
                onClick={() => onMarketSelect(market.id!)}
                className={`p-4 cursor-pointer hover:bg-gray-700/50 transition-colors ${
                  selectedMarketId === market.id ? 'bg-blue-900/30' : ''
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white">{formatted.name}</p>
                    <p className="text-sm text-gray-400">{formatted.chainName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-green-300">{formatted.supplyApyFormatted}</p>
                    <p className="text-xs text-gray-500">Supply APY</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
