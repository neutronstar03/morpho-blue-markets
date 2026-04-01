import type { PositionGroup } from './position-types'
import { formatUsd } from '~/lib/formatters'
import { PositionListItem } from './position-list-item'

export function PositionGroups({
  groups,
  chainId,
  portfolioTotalAssetsUsd,
  aprByMarketKey,
  riskStatusByKey,
}: {
  groups: PositionGroup[]
  chainId: number
  portfolioTotalAssetsUsd?: number
  aprByMarketKey: Record<string, { apr?: number }>
  riskStatusByKey: Record<string, 'white' | 'blue' | 'yellow' | 'purple' | 'black' | undefined>
}) {
  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.key} className="space-y-2 sm:space-y-3">
          <div className="px-1">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white sm:text-base">
                {group.loanAssetSymbol}
                {portfolioTotalAssetsUsd != null && portfolioTotalAssetsUsd > 0 && (
                  <span className="ml-2 text-xs font-medium text-gray-400 sm:text-sm">
                    (
                    {((group.totalValueUsd / portfolioTotalAssetsUsd) * 100).toFixed(1)}
                    %)
                  </span>
                )}
              </h3>
              <span className="text-xs text-gray-400 sm:text-sm">
                {group.totalValueUsd > 0 ? formatUsd(group.totalValueUsd) : '—'}
                {' | '}
                {group.yearlyUsd > 0 ? formatUsd(group.yearlyUsd) : '—'}
                {' / yr'}
              </span>
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
      ))}
    </div>
  )
}
