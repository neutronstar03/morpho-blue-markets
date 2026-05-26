import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { DetailPillGrid } from '~/components/ui/detail-pill-grid'
import { StatPill } from '~/components/ui/stat-pill'
import { formatLltv, formatPercent, formatUsd } from '~/lib/formatters'

interface Props {
  market: SingleMorphoMarket
}

export function MarketDetailSection({ market }: Props) {
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold text-white sm:mb-4">Market Detail</h2>
      <DetailPillGrid>
        <StatPill label="Total Supply" value={formatUsd(market.state.supplyAssetsUsd)} />
        <StatPill label="Total Borrow" value={formatUsd(market.state.borrowAssetsUsd)} />
        <StatPill label="Utilization" value={formatPercent(market.state.utilization)} />
        <StatPill label="LLTV" value={formatLltv(market.lltv)} />
      </DetailPillGrid>
    </div>
  )
}
