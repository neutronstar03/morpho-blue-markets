import { formatPercent } from '~/lib/formatters'

interface MarketAprPreviewProps {
  beforeUtil: number
  afterUtil: number
  beforeApr?: number
  afterApr?: number
  showEstimateLabel?: boolean
}

export function MarketAprPreview({
  beforeUtil,
  afterUtil,
  beforeApr,
  afterApr,
  showEstimateLabel = false,
}: MarketAprPreviewProps) {
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
        <span className="text-gray-400">Supply APR</span>
        <span className="text-gray-200">
          {beforeApr != null ? formatPercent(beforeApr) : '----'}
          {' '}
          →
          {' '}
          {afterApr != null ? formatPercent(afterApr) : '----'}
          {showEstimateLabel && <span className="ml-1 text-gray-500">(est.)</span>}
        </span>
      </div>
    </div>
  )
}
