import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { formatPercent } from '~/lib/formatters'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket } from '~/lib/hooks/rpc/use-morpho'

interface Props {
  market: SingleMorphoMarket
}

function Row({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700/50 py-1.5 last:border-b-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white font-medium text-sm">{value}</span>
    </div>
  )
}

export function SupplyRatesCollapsible({ market }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: marketStateRaw } = useMarket(market.uniqueKey)
  const live = useMarketPreview({ market, marketStateRaw, deltaSupplyAssets: 0n })

  const avgApy = market.state.avgSupplyApy ?? market.state.avgNetSupplyApy

  return (
    <div className="rounded-lg border border-gray-700/50 bg-gray-900/30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-gray-300">Supply Rates</span>
        <div className="flex items-center gap-2">
          {!isOpen && avgApy != null && (
            <span className="text-sm font-medium text-white">
              Avg APY
              {' '}
              {formatPercent(avgApy)}
            </span>
          )}
          {isOpen
            ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              )
            : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-2.5">
          <Row
            label="Instantaneous APR"
            value={live.supplyAprBefore != null ? formatPercent(live.supplyAprBefore) : '----'}
          />
          <Row
            label="Rate at Target APR"
            value={live.rateAtTargetApr != null ? formatPercent(live.rateAtTargetApr) : '—'}
          />
          <Row
            label="Daily APY"
            value={formatPercent(market.state.dailySupplyApy ?? market.state.dailyNetSupplyApy)}
          />
          <Row
            label="Weekly APY"
            value={formatPercent(market.state.weeklySupplyApy ?? market.state.weeklyNetSupplyApy)}
          />
          <Row
            label="Average APY"
            value={formatPercent(market.state.avgSupplyApy ?? market.state.avgNetSupplyApy)}
          />
        </div>
      )}
    </div>
  )
}
