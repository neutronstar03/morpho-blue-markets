import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { PiggyBank } from 'lucide-react'
import { Badge, BadgeLabel } from '~/components/ui/badge'
import { formatBigintShort, formatUsd } from '~/lib/formatters'
import { getPositionPrincipalUsd, getPositionSuppliedAssets } from './position-utils'

export function VaultV2PositionList({
  positions,
  aprByMarketKey,
}: {
  positions: LiveMarketPosition[]
  aprByMarketKey: Record<string, { apr?: number }>
}) {
  if (positions.length === 0)
    return null

  return (
    <section className="space-y-2 sm:space-y-3" data-testid="positions-vault-v2-section">
      <div className="px-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white sm:text-base">
          <PiggyBank className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          <span>Vault holdings</span>
        </h3>
      </div>
      <ul className="space-y-2 sm:space-y-3">
        {positions.map((position) => {
          const suppliedAssets = getPositionSuppliedAssets(position)
          if (suppliedAssets <= 0n)
            return null

          const loanDecimals = position.market.loanAsset.decimals ?? 18
          const principalUsd = getPositionPrincipalUsd(position)
          const apr = aprByMarketKey[position.market.uniqueKey]?.apr
          const aprPct = apr != null ? apr * 100 : undefined
          const vaultName = position.source?.vaultName ?? position.market.collateralAsset.symbol
          const vaultSymbol = position.source?.vaultSymbol ?? position.market.collateralAsset.symbol
          const vaultAddress = position.source?.vaultAddress ?? position.market.collateralAsset.address

          return (
            <li
              key={`${position.market.uniqueKey}:${vaultAddress}`}
              className="py-3 px-2.5 sm:p-4 bg-emerald-950/10 border border-emerald-900/40 rounded-lg"
              data-testid="positions-vault-v2-row"
            >
              <div className="flex flex-row items-center justify-between gap-4">
                <div className="min-w-0 space-y-0.5 sm:space-y-1">
                  <p className="truncate text-lg font-semibold text-white sm:text-xl">{vaultSymbol}</p>
                  <p className="text-base text-gray-300 sm:text-lg">
                    {formatBigintShort(suppliedAssets, loanDecimals)}
                    {' '}
                    {position.market.loanAsset.symbol}
                  </p>
                  <p className="text-xs font-medium text-emerald-300">{vaultName}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="subtle" size="sm">
                    <BadgeLabel>Value</BadgeLabel>
                    {principalUsd != null ? formatUsd(principalUsd) : '—'}
                  </Badge>
                  <Badge variant="success" size="sm">
                    <BadgeLabel>APR</BadgeLabel>
                    {aprPct != null ? `${aprPct.toFixed(2)}%` : '—'}
                  </Badge>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
