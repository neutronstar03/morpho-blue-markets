import type { FormattedMarket } from '../lib/hooks/use-market'
import type { MarketParams } from '../lib/hooks/use-morpho'
import { MarketHeader } from './market/market-header'
import { MarketMetrics } from './market/market-metrics'
import { MarketDetails } from './market/market-details'
import { UserPosition } from './market/user-position'
import { MarketActions } from './market/market-actions'

interface MarketDisplayProps {
  market: FormattedMarket
}

export function MarketDisplay({ market }: MarketDisplayProps) {
  const marketParams: MarketParams = {
    loanToken: market.loanAsset.address,
    collateralToken: market.collateralAsset.address,
    oracle: market.oracleAddress,
    irm: market.irmAddress,
    lltv: market.lltvRaw,
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700">
      <MarketHeader market={market} />
      <MarketMetrics market={market} />
      <MarketDetails market={market} />
      <UserPosition market={market} marketParams={marketParams} />
      <MarketActions market={market} marketParams={marketParams} />
    </div>
  )
}
