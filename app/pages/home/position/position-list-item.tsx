import type { LiveMarketPosition } from '~/lib/hooks/rpc/use-live-market-positions'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge, BadgeLabel } from '~/components/ui/badge'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { getSupportedChainName } from '~/lib/addresses'
import { formatBigintShort } from '~/lib/formatters'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'
import { getPositionPrincipalUsd } from './position-utils'

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
  const marketSupplyAssets = BigInt(position.market.state.supplyAssets)
  const marketSupplyShares = BigInt(position.market.state.supplyShares)
  const userSupplyShares = BigInt(position.userState.supplyShares)
  const loanDecimals = position.market.loanAsset.decimals ?? 18

  const suppliedAssets = useMemo(() => {
    if (marketSupplyShares === 0n)
      return 0n
    return (userSupplyShares * marketSupplyAssets) / marketSupplyShares
  }, [userSupplyShares, marketSupplyAssets, marketSupplyShares])

  const apr = liveApr != null ? liveApr * 100 : undefined

  const principalUsd = useMemo(() => {
    return getPositionPrincipalUsd(position)
  }, [position])

  const contributionPct = useMemo(() => {
    if (totalValueUsd == null || totalValueUsd <= 0 || principalUsd == null)
      return undefined
    return (principalUsd / totalValueUsd) * 100
  }, [principalUsd, totalValueUsd])

  const { safuness } = useSafuness({
    chainId,
    collateralAddress: position.market.collateralAsset.address,
  })

  return (
    <Link to={`/market/${position.market.uniqueKey}/${chainId}`}>
      <li className="py-3 px-2.5 sm:p-4 bg-gray-900/50 border border-gray-800 rounded-lg hover:bg-gray-900 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <div className="flex flex-row justify-between items-center">
          <div className="space-y-0.5 sm:space-y-1">
            <div>
              <MarketRiskText status={riskStatus} size="xl" className="font-semibold">
                {`${position.market.collateralAsset.symbol} / ${position.market.loanAsset.symbol}`}
              </MarketRiskText>
              <p className="text-xs text-gray-500">{getSupportedChainName(chainId)}</p>
            </div>

            <p className="text-sm sm:text-base text-gray-300">
              <span className="text-xs sm:text-sm text-gray-400">Supply:</span>
              {' '}
              {formatBigintShort(suppliedAssets, loanDecimals)}
              {' '}
              {position.market.loanAsset.symbol}
            </p>
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
            <Badge variant="subtle" size="sm">
              <span>Weight</span>
              <span className="text-gray-400">{contributionPct != null ? `${contributionPct.toFixed(1)}%` : '—'}</span>
            </Badge>
          </div>
        </div>
      </li>
    </Link>
  )
}
