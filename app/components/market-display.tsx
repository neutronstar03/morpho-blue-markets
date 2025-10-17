import type { FormattedMarket } from '~/lib/types'
import { MarketActions } from './market/market-actions'
import { MarketDetails } from './market/market-details'
import { MarketHeader } from './market/market-header'
import { MarketMetrics } from './market/market-metrics'
import { UserPosition } from './market/user-position'

interface MarketDisplayProps {
  market: FormattedMarket
}

export function MarketDisplay({ market }: MarketDisplayProps) {
  if (!market)
    return <div>Loading market data...</div>

  return (
    <div className="bg-gray-800 text-white max-w-4xl mx-auto my-8 rounded-lg shadow-2xl overflow-hidden">
      <UserPosition market={market} />
      <MarketHeader market={market} />
      <MarketMetrics market={market} />
      <div className="grid grid-cols-1 md:grid-cols-2">
        <MarketDetails market={market} />

        <MarketActions market={market} />
      </div>
    </div>
  )
}
