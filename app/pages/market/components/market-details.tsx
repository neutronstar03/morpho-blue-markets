import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { MarketCollateralReview } from './market-collateral-review'
import { MarketDetailSection } from './market-detail-section'
import { RiskAssessmentSection } from './market-risk-assessment'

interface MarketDetailsProps {
  market: SingleMorphoMarket
}

export function MarketDetails({ market }: MarketDetailsProps) {
  return (
    <div className="p-3 sm:p-6">
      <MarketDetailSection market={market} />
      <RiskAssessmentSection market={market} />
      <MarketCollateralReview market={market} />
    </div>
  )
}
