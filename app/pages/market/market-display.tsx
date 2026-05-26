import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { MarketActions } from './components/market-actions'
import { MarketDetails } from './components/market-details'
import { MarketHeader } from './components/market-header'
import { MarketRiskValidation } from './components/market-risk-validation'
import { SupplyRatesCollapsible } from './components/market-supply-rates-collapsible'

interface MarketDisplayProps {
  market: SingleMorphoMarket
}

export function MarketDisplay({ market }: MarketDisplayProps) {
  if (!market)
    return <div>Loading market data...</div>

  return (
    <div className="sm:bg-gray-800 sm:rounded-lg sm:shadow-lg sm:border sm:border-gray-700 overflow-hidden">
      <MarketHeader market={market} />
      <div className="px-3 pt-3 sm:px-6 sm:pt-4 md:hidden">
        <MarketRiskValidation market={market} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <MarketDetails market={market} />
        <div className="flex flex-col">
          <div className="hidden md:block p-6 pb-0">
            <MarketRiskValidation market={market} />
          </div>
          <div className="hidden md:block p-6 pt-4 pb-0">
            <SupplyRatesCollapsible market={market} />
          </div>
          <MarketActions market={market} />
        </div>
      </div>
      {/* Mobile-only Supply Rates */}
      <div className="px-3 sm:px-6 pb-3 md:hidden">
        <SupplyRatesCollapsible market={market} />
      </div>
    </div>
  )
}
