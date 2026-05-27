import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { Badge } from '~/components/ui/badge'
import { DetailPillGrid } from '~/components/ui/detail-pill-grid'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { StatPill } from '~/components/ui/stat-pill'
import { formatPercent, formatTokenAmountShort, formatUsd } from '~/lib/formatters'
import { useMarketLiquidations } from '~/lib/hooks/graphql/use-market-liquidations'
import { useCollateralReview } from '~/lib/hooks/use-collateral-review'
import { useOracleDrift } from '~/lib/hooks/use-oracle-drift'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'
import { useSwapEstimate } from '~/lib/hooks/use-swap-estimate'
import { getOracleProviderRank } from '~/lib/oracle-provider-rank'
import { getOracleProvider, useOracleProvidersVersion } from '~/lib/oracle-providers'
import { DetailRow, SectionTitle, SubGroupContent, SubGroupTitle } from './market-detail-shared'

interface Props {
  market: SingleMorphoMarket
}

function OracleProviderValue({ provider, rank: rankOverride }: { provider: string, rank?: number }) {
  const rank = rankOverride ?? getOracleProviderRank(provider)
  if (!rank)
    return <span>{provider}</span>

  function rankClass(r: number) {
    if (r >= 5)
      return 'border-green-700/30 bg-green-900/30 text-green-400'
    if (r >= 4)
      return 'border-lime-700/30 bg-lime-900/30 text-lime-300'
    if (r >= 3)
      return 'border-yellow-700/30 bg-yellow-900/30 text-yellow-300'
    if (r >= 2)
      return 'border-orange-700/30 bg-orange-900/30 text-orange-400'
    return 'border-red-700/30 bg-red-900/30 text-red-400'
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span>{provider}</span>
      <Badge
        variant="neutral"
        className={rankClass(rank)}
        title={`Oracle provider confidence: ${rank}/5`}
      >
        {rank}
        {' '}
        / 5
      </Badge>
    </span>
  )
}

function formatCrossPrice(price: number, collateralSymbol: string, loanSymbol: string) {
  return `${collateralSymbol} / ${loanSymbol} = ${price.toFixed(4)}`
}

function DriftValue({ drift, driftPct }: { drift: number, driftPct: number }) {
  const absPct = Math.abs(driftPct)
  const colorClass = absPct >= 1 ? 'text-red-400' : 'text-green-400'
  const sign = drift > 0 ? '+' : ''
  const pctSign = driftPct > 0 ? '+' : ''
  return (
    <span className={colorClass}>
      {sign}
      {drift.toFixed(4)}
      {' '}
      (
      {pctSign}
      {driftPct.toFixed(2)}
      %)
    </span>
  )
}

export function RiskAssessmentSection({ market }: Props) {
  useOracleProvidersVersion()

  const {
    liquidityUsd,
    safuness,
    isLoadingLiquidity: isLiqLoading,
  } = useSafuness({
    chainId: market.morphoBlue.chain.id,
    collateralAddress: market.collateralAsset.address,
  })

  const { data: liquidationCount, isLoading: isLiqCountLoading } = useMarketLiquidations(
    market.uniqueKey,
    market.morphoBlue.chain.id,
  )

  const { oraclePrice, marketPrice, drift, driftPct } = useOracleDrift(market)
  const hasDrift = oraclePrice != null && marketPrice != null

  const { sellAmountFormatted } = useSwapEstimate(market)

  const isKatana = market.morphoBlue.chain.id === 747474

  const supplyingVaultCount = market.supplyingVaults.length + market.supplyingVaultV2s.length

  const monarchOracleProvider = getOracleProvider(market.morphoBlue.chain.id, market.oracleAddress)
  const { data: review } = useCollateralReview(
    market.morphoBlue.chain.id,
    market.collateralAsset.address,
    market.oracleAddress,
  )
  const oracleReviewOverride = review?.oracleReview ?? null
  const oracleProvider = oracleReviewOverride?.provider ?? monarchOracleProvider
  const oracleProviderRank = oracleReviewOverride?.rank

  const marketPriceTooltip = isKatana
    ? 'External price reference from DefiLlama (Katana fallback).'
    : sellAmountFormatted
      ? `Swap simulated with ${formatTokenAmountShort(Number(sellAmountFormatted))} ${market.collateralAsset.symbol}`
      : 'Live DEX spot price via 0x swap simulation. Excludes 0x protocol fee.'

  return (
    <>
      <SectionTitle title="Risk Assessment" />

      <SubGroupTitle title="Market Health" />
      <SubGroupContent>
        <DetailPillGrid>
          <StatPill
            label="Cumulative Liquidity"
            value={isLiqLoading ? 'Loading…' : (liquidityUsd != null ? formatUsd(liquidityUsd) : '—')}
          />
          <StatPill
            label="SAFUNESS"
            value={safuness != null
              ? (
                  <span className={safunessColorClass(safuness)}>
                    {safuness.toFixed(2)}
                    x
                  </span>
                )
              : '—'}
          />
        </DetailPillGrid>

        <DetailPillGrid columns={3}>
          <StatPill
            className="flex-row"
            label="Liquidations"
            value={(
              <span className={liquidationCount === 0 ? 'text-red-400' : 'text-green-400'}>
                {isLiqCountLoading ? '…' : liquidationCount}
              </span>
            )}
          />
          <StatPill
            className="flex-row"
            label="Vaults"
            value={(
              <span className={supplyingVaultCount === 0 ? 'text-red-400' : supplyingVaultCount > 1 ? 'text-green-400' : 'text-gray-300'}>
                {supplyingVaultCount}
              </span>
            )}
          />
          <StatPill
            className="flex-row"
            label="Listed"
            value={market.listed
              ? (
                  <span className="inline-flex items-center gap-1 text-green-400">
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    Yes
                  </span>
                )
              : (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <XCircleIcon className="h-3.5 w-3.5" />
                    No
                  </span>
                )}
          />
        </DetailPillGrid>
      </SubGroupContent>

      <SubGroupTitle title="Price & Oracle" />
      <SubGroupContent>
        {oracleProvider && (
          <DetailRow
            label="Oracle Provider"
            value={<OracleProviderValue provider={oracleProvider} rank={oracleProviderRank} />}
            noBorder
          />
        )}
        <DetailRow
          label="Daily Price Variation"
          value={formatPercent(market.state.dailyPriceVariation)}
          noBorder
        />
        <DetailPillGrid>
          <StatPill
            label="Oracle price"
            value={oraclePrice != null
              ? formatCrossPrice(oraclePrice, market.collateralAsset.symbol, market.loanAsset.symbol)
              : '—'}
          />
          <StatPill
            label={(
              <span className="inline-flex items-center gap-1">
                Market price
                <InfoTooltip content={marketPriceTooltip} iconClassName="text-gray-500" />
              </span>
            )}
            value={marketPrice != null
              ? formatCrossPrice(marketPrice, market.collateralAsset.symbol, market.loanAsset.symbol)
              : (
                  <span className="text-gray-500">N/A</span>
                )}
          />
        </DetailPillGrid>
        {hasDrift && drift != null && driftPct != null && (
          <DetailRow
            label="Oracle drift"
            value={<DriftValue drift={drift} driftPct={driftPct} />}
            noBorder
          />
        )}
      </SubGroupContent>

      <SubGroupTitle title="Debt" />
      <SubGroupContent>
        <DetailPillGrid>
          <StatPill label="Bad Debt" value={formatUsd(market.badDebt.usd)} />
          <StatPill label="Realized Bad Debt" value={formatUsd(market.realizedBadDebt.usd)} />
        </DetailPillGrid>
      </SubGroupContent>
    </>
  )
}
