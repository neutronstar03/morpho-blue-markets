import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { Card } from '~/components/ui/card'
import { MarketActions } from './components/market-actions'
import { MarketDetails } from './components/market-details'
import { MarketHeader } from './components/market-header'

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
