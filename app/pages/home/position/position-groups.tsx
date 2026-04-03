import type { PositionGroup } from './position-types'
import { DollarSign, HandCoins, PiggyBank, Scale } from 'lucide-react'
import { formatUsd } from '~/lib/formatters'
import { PositionListItem } from './position-list-item'

export function PositionGroups({
  groups,
  chainId,
  portfolioTotalAssetsUsd,
  aprByMarketKey,
  riskStatusByKey,
  summaryMode,
  onToggleSummaryMode,
}: {
  groups: PositionGroup[]
  chainId: number
  portfolioTotalAssetsUsd?: number
  aprByMarketKey: Record<string, { apr?: number }>
  riskStatusByKey: Record<string, 'white' | 'blue' | 'yellow' | 'purple' | 'black' | undefined>
  summaryMode: 'total' | 'yearly'
  onToggleSummaryMode: () => void
}) {
  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const weightPct = portfolioTotalAssetsUsd != null && portfolioTotalAssetsUsd > 0
          ? (group.totalValueUsd / portfolioTotalAssetsUsd) * 100
          : undefined
        const shouldShowWeight = weightPct != null && weightPct < 99.95
        const assetAprPct = group.totalValueUsd > 0
          ? (group.yearlyUsd / group.totalValueUsd) * 100
          : undefined
        const isTotalMode = summaryMode === 'total'
        const SummaryIcon = isTotalMode ? DollarSign : PiggyBank
        const summaryValue = isTotalMode
          ? (group.totalValueUsd > 0 ? formatUsd(group.totalValueUsd) : '—')
          : (group.yearlyUsd > 0 ? `${formatUsd(group.yearlyUsd)} / yr` : '— / yr')
        const summaryIconClassName = isTotalMode ? 'text-sky-300' : 'text-emerald-300'

        return (
          <div key={group.key} className="space-y-2 sm:space-y-3" data-testid="positions-asset-group">
            <div className="px-1">
              <div className="flex items-center justify-between gap-3" data-testid="positions-asset-group-header">
                <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-white sm:text-base">
                  <span>{group.loanAssetSymbol}</span>
                  {shouldShowWeight && (
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-300 sm:text-sm">
                      <Scale className="h-3.5 w-3.5 text-slate-300" />
                      <span>
                        {weightPct.toFixed(1)}
                        %
                      </span>
                    </span>
                  )}
                  {assetAprPct != null && (
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-300 sm:text-sm">
                      <HandCoins className="h-3.5 w-3.5 text-emerald-300" />
                      {assetAprPct.toFixed(1)}
                      %
                      <span>APR</span>
                    </span>
                  )}
                </h3>
                <button
                  type="button"
                  onClick={onToggleSummaryMode}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 sm:text-sm"
                  data-testid="positions-asset-group-summary-toggle"
                  data-summary-mode={summaryMode}
                  aria-label={isTotalMode ? 'Switch asset summaries to yearly USD' : 'Switch asset summaries to total USD'}
                >
                  <SummaryIcon className={`h-3.5 w-3.5 ${summaryIconClassName}`} />
                  <span data-testid="positions-asset-group-summary">{summaryValue}</span>
                </button>
              </div>
            </div>
            <ul className="space-y-2 sm:space-y-3">
              {group.positions.map((position) => {
                const key = `${chainId}:${position.market.uniqueKey.toLowerCase()}`
                const riskStatus = riskStatusByKey[key]
                return (
                  <PositionListItem
                    key={position.market.uniqueKey}
                    position={position}
                    chainId={chainId}
                    liveApr={aprByMarketKey[position.market.uniqueKey]?.apr}
                    totalValueUsd={group.totalValueUsd || undefined}
                    riskStatus={riskStatus}
                  />
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
