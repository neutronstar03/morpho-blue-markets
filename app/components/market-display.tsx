import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { MarketActions } from './market/market-actions'
import { MarketDetails } from './market/market-details'
import { MarketHeader } from './market/market-header'
import { Card } from './ui/card'

interface MarketDisplayProps {
  market: SingleMorphoMarket
}

export function MarketDisplay({ market }: MarketDisplayProps) {
  if (!market)
    return <div>Loading market data...</div>

  return (
    <Card>
      <MarketHeader market={market} />
      <div className="grid grid-cols-1 md:grid-cols-2">
        <MarketDetails market={market} />

        <MarketActions market={market} />
      </div>
    </Card>
  )
}
