import type { SingleMorphoMarket } from '~/lib/hooks/use-market'

interface MarketMetricsProps {
  market: SingleMorphoMarket
}

export function MarketMetrics({ market }: MarketMetricsProps) {
  return (
    <div className="p-6 border-b border-gray-700">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-900/30 border border-green-700/50 p-4 rounded-lg">
          <p className="text-sm font-medium text-green-300">Total Supply</p>
          <p className="text-2xl font-bold text-green-100">{market.totalSupplyFormatted}</p>
        </div>
        <div className="bg-blue-900/30 border border-blue-700/50 p-4 rounded-lg">
          <p className="text-sm font-medium text-blue-300">Total Borrow</p>
          <p className="text-2xl font-bold text-blue-100">{market.totalBorrowFormatted}</p>
        </div>
        <div className="bg-purple-900/30 border border-purple-700/50 p-4 rounded-lg">
          <p className="text-sm font-medium text-purple-300">Supply APY</p>
          <p className="text-2xl font-bold text-purple-100">{market.supplyApyFormatted}</p>
        </div>
        <div className="bg-orange-900/30 border border-orange-700/50 p-4 rounded-lg">
          <p className="text-sm font-medium text-orange-300">Utilization</p>
          <p className="text-2xl font-bold text-orange-100">{market.utilizationFormatted}</p>
        </div>
        <div className="bg-indigo-900/30 border border-indigo-700/50 p-4 rounded-lg">
          <p className="text-sm font-medium text-indigo-300">LLTV</p>
          <p className="text-2xl font-bold text-indigo-100">{market.lltvPercent}</p>
        </div>
      </div>
    </div>
  )
}
