import { formatPercent } from '~/lib/formatters'

interface MarketApyPreviewProps {
  beforeUtil: number
  afterUtil: number
  beforeApy?: number
  afterApy?: number
  showEstimateLabel?: boolean
}

export function MarketApyPreview({
  beforeUtil,
  afterUtil,
  beforeApy,
  afterApy,
  showEstimateLabel = false,
}: MarketApyPreviewProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Utilization</span>
        <span className="text-gray-200">
          {formatPercent(beforeUtil)}
          {' '}
          →
          {' '}
          {formatPercent(afterUtil)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-gray-400">Supply APY</span>
        <span className="text-gray-200">
          {beforeApy != null ? formatPercent(beforeApy) : '----'}
          {' '}
          →
          {' '}
          {afterApy != null ? formatPercent(afterApy) : '----'}
          {showEstimateLabel && <span className="ml-1 text-gray-500">(est.)</span>}
        </span>
      </div>
    </div>
  )
}
