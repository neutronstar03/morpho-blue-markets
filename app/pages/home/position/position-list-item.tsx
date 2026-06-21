import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { Gauge, Scale } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge, BadgeLabel } from '~/components/ui/badge'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { formatBigintShort, formatPercent } from '~/lib/formatters'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'
import { getPositionPrincipalUsd, getPositionSuppliedAssets } from './position-utils'

export function PositionListItem({
  position,
  chainId,
  liveApr,
  totalValueUsd,
  riskStatus,
}: {
  position: LiveMarketPosition
  chainId: number
  liveApr?: number
  totalValueUsd?: number
  riskStatus?: 'white' | 'blue' | 'yellow' | 'purple' | 'black'
}) {
  const loanDecimals = position.market.loanAsset.decimals ?? 18

  const suppliedAssets = useMemo(() => {
    return getPositionSuppliedAssets(position)
  }, [position])

  if (suppliedAssets <= 0n)
    return null

  const apr = liveApr != null ? liveApr * 100 : undefined

  const principalUsd = useMemo(() => {
    return getPositionPrincipalUsd(position)
  }, [position])

  const contributionPct = useMemo(() => {
    if (totalValueUsd == null || totalValueUsd <= 0 || principalUsd == null)
      return undefined
    return (principalUsd / totalValueUsd) * 100
  }, [principalUsd, totalValueUsd])

  const contributionLabel = contributionPct != null ? formatPercent(contributionPct / 100, 1) : '—'
  const marketUsageLabel = formatPercent(position.market.state.utilization, 1)

  const { safuness } = useSafuness({
    chainId,
    collateralAddress: position.market.collateralAsset.address,
  })

  return (
    <Link to={`/market/${position.market.uniqueKey}/${chainId}`} data-umami-event="market_navigate" data-umami-data-source="positions">
      <li className="py-3 px-2.5 sm:p-4 bg-gray-900/50 border border-gray-800 rounded-lg hover:bg-gray-900 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <div className="flex flex-row justify-between items-center">
          <div className="space-y-0.5 sm:space-y-1">
            <div>
              <MarketRiskText status={riskStatus} size="xl" className="font-semibold">
                {position.market.collateralAsset.symbol}
              </MarketRiskText>
            </div>

            <p className="text-base text-gray-300 sm:text-lg">
              {formatBigintShort(suppliedAssets, loanDecimals)}
              {' '}
              {position.market.loanAsset.symbol}
            </p>
            {position.source?.kind === 'vaultV2Adapter' && position.source.vaultSymbol && (
              <p className="text-xs font-medium text-cyan-300">
                via
                {' '}
                {position.source.vaultSymbol}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1">
            <Badge variant="success" size="sm">
              <BadgeLabel>APR</BadgeLabel>
              {apr != null ? `${apr.toFixed(2)}%` : '—'}
            </Badge>
            <Badge variant="neutral" size="sm" className={safunessColorClass(safuness)}>
              <BadgeLabel>Safety</BadgeLabel>
              {safuness != null ? `${safuness.toFixed(2)}x` : '—'}
            </Badge>
            <div className="flex items-center gap-1">
              <Badge
                variant="subtle"
                size="sm"
                title="Portfolio weight"
                aria-label={`Portfolio weight ${contributionLabel}`}
              >
                <Scale className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
                <span className="text-gray-400">{contributionLabel}</span>
              </Badge>
              <Badge
                variant="subtle"
                size="sm"
                title="Market usage"
                aria-label={`Market usage ${marketUsageLabel}`}
              >
                <Gauge className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                <span className="text-gray-400">{marketUsageLabel}</span>
              </Badge>
            </div>
          </div>
        </div>
      </li>
    </Link>
  )
}
