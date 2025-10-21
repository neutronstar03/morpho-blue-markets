import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { formatLltv, formatPercent, formatUsd } from '~/lib/formatters'
import { Card } from '../ui/card'

interface MarketDetailsProps {
  market: SingleMorphoMarket
}

function DetailRow({
  label,
  value,
  subValue,
}: {
  label: React.ReactNode
  value: React.ReactNode
  subValue?: React.ReactNode
}) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-b-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <div className="text-right">
        <span className="text-white font-medium">{value}</span>
        {subValue && <div className="text-xs text-gray-500">{subValue}</div>}
      </div>
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-lg font-semibold text-white mt-6 mb-2 border-b-2 border-blue-500 pb-1">
      {title}
    </h3>
  )
}

export function MarketDetails({ market }: MarketDetailsProps) {
  return (
    <Card className="p-6 bg-gray-800/50">
      <h2 className="text-xl font-semibold text-white mb-4">Market Details</h2>

      <DetailRow
        label="Total Supply"
        value={formatUsd(market.state.supplyAssetsUsd)}
      />
      <DetailRow
        label="Total Borrow"
        value={formatUsd(market.state.borrowAssetsUsd)}
      />
      <DetailRow
        label="Utilization"
        value={formatPercent(market.state.utilization)}
      />
      <DetailRow label="LLTV" value={formatLltv(market.lltv)} />

      <SectionTitle title="Collateral" />
      <DetailRow
        label="Daily Price Variation"
        value={formatPercent(market.state.dailyPriceVariation)}
      />
      <DetailRow
        label="Whitelisted"
        value={
          market.whitelisted
            ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500 inline-block" />
              )
            : (
                <XCircleIcon className="h-5 w-5 text-red-500 inline-block" />
              )
        }
      />

      <SectionTitle title="Risk" />
      <DetailRow label="Bad Debt" value={formatUsd(market.badDebt.usd)} />
      <DetailRow
        label="Realized Bad Debt"
        value={formatUsd(market.realizedBadDebt.usd)}
      />
      <DetailRow
        label="Supplying Vaults"
        value={market.supplyingVaults.length}
      />

      <SectionTitle title="Supply APY" />
      <DetailRow
        label="Current"
        value={formatPercent(market.state.netSupplyApy)}
      />

      <DetailRow
        label="Daily"
        value={formatPercent(market.state.dailyNetSupplyApy)}
      />
      <DetailRow
        label="Weekly"
        value={formatPercent(market.state.weeklyNetSupplyApy)}
      />
      <DetailRow
        label="Average"
        value={formatPercent(market.state.avgNetSupplyApy)}
      />

      <SectionTitle title="Borrow APY" />
      <DetailRow
        label="Current"
        value={formatPercent(market.state.netBorrowApy)}
      />
      <DetailRow
        label="Daily"
        value={formatPercent(market.state.dailyNetBorrowApy)}
      />
      <DetailRow
        label="Weekly"
        value={formatPercent(market.state.weeklyNetBorrowApy)}
      />
      <DetailRow
        label="Average"
        value={formatPercent(market.state.avgNetBorrowApy)}
      />
    </Card>
  )
}
