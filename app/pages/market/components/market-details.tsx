import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { formatLltv, formatPercent, formatUsd } from '~/lib/formatters'
import { useMarketLiquidations } from '~/lib/hooks/graphql/use-market-liquidations'
import { useMarketPreview } from '~/lib/hooks/rpc/use-market-preview'
import { useMarket } from '~/lib/hooks/rpc/use-morpho'
import { safunessColorClass, useSafuness } from '~/lib/hooks/use-safuness'
import { getOracleProviderRank } from '~/lib/oracle-provider-rank'
import { getOracleProvider, useOracleProvidersVersion } from '~/lib/oracle-providers'
import { MarketCollateralReview } from './market-collateral-review'

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
    <div className="flex items-center justify-between border-b border-gray-700/50 py-2 last:border-b-0">
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

function oracleProviderRankClass(rank: number) {
  if (rank >= 5)
    return 'border-green-700/30 bg-green-900/30 text-green-400'
  if (rank >= 4)
    return 'border-lime-700/30 bg-lime-900/30 text-lime-300'
  if (rank >= 3)
    return 'border-yellow-700/30 bg-yellow-900/30 text-yellow-300'
  if (rank >= 2)
    return 'border-orange-700/30 bg-orange-900/30 text-orange-400'
  return 'border-red-700/30 bg-red-900/30 text-red-400'
}

function OracleProviderValue({ provider }: { provider: string }) {
  const rank = getOracleProviderRank(provider)

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span>{provider}</span>
      {rank && (
        <Badge
          variant="neutral"
          className={oracleProviderRankClass(rank)}
          title={`Coarse provider confidence: ${rank}/5`}
        >
          {rank}
          {' '}
          / 5
        </Badge>
      )}
    </span>
  )
}

export function MarketDetails({ market }: MarketDetailsProps) {
  useOracleProvidersVersion()
  const supplyingVaultCount = market.supplyingVaults.length + market.supplyingVaultV2s.length
  const oracleProvider = getOracleProvider(market.morphoBlue.chain.id, market.oracleAddress)

  const { data: marketStateRaw } = useMarket(market.uniqueKey)
  const live = useMarketPreview({ market, marketStateRaw, deltaSupplyAssets: 0n })
  const liveSupplyApr = live.supplyAprBefore
  const liveRateAtTargetApr = live.rateAtTargetApr

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

  const [showLiqInfo, setShowLiqInfo] = useState(false)
  const [showSafuInfo, setShowSafuInfo] = useState(false)

  const liqTip = 'Estimated aggregate DEX liquidity for this collateral token on this chain. We conservatively assume ~50% of pool liquidity is directly usable in the collateral token.'
  const safuTip = 'SAFUNESS = usable liquidity / total supply (aggregated across all markets that share this collateral on this chain). 1.0x means usable liquidity equals total supply; liquidation may incur significant price impact. Assumes ~50% in collateral. ≥3.0x safer, <1.0x risky.'

  return (
    <div className="p-3 sm:p-6">
      <h2 className="mb-3 text-xl font-semibold text-white sm:mb-4">Market Details</h2>

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
      {oracleProvider && (
        <DetailRow label="Oracle Provider" value={<OracleProviderValue provider={oracleProvider} />} />
      )}

      <SectionTitle title="Collateral" />
      <DetailRow
        label="Cumulative Liquidity"
        value={isLiqLoading ? 'Loading…' : (liquidityUsd != null ? formatUsd(liquidityUsd) : '—')}
        subValue={(
          <>
            {!showLiqInfo
              ? (
                  <>
                    Aggregated across pools (supposing liquidity in collateral is ~50% of liquidity in the pool)
                    <button
                      type="button"
                      className="ml-2 underline cursor-pointer"
                      onClick={() => setShowLiqInfo(true)}
                    >
                      Learn more
                    </button>
                  </>
                )
              : (
                  <>
                    {liqTip}
                    <button
                      type="button"
                      className="ml-2 underline cursor-pointer"
                      onClick={() => setShowLiqInfo(false)}
                    >
                      Hide
                    </button>
                  </>
                )}
          </>
        )}
      />
      <DetailRow
        label="Liquidity / Total Supply (SAFUNESS)"
        value={safuness != null
          ? (
              <span className={safunessColorClass(safuness)}>
                {safuness.toFixed(2)}
                x
              </span>
            )
          : '—'}
        subValue={(
          <>
            {!showSafuInfo
              ? (
                  <>
                    1.0x ≈ enough liquidity equals total supply (not price-impact free)
                    <button
                      type="button"
                      className="ml-2 underline cursor-pointer"
                      onClick={() => setShowSafuInfo(true)}
                    >
                      Learn more
                    </button>
                  </>
                )
              : (
                  <>
                    {safuTip}
                    <div className="mt-1">
                      <span className="text-green-400">≥ 5.0x</span>
                      {' '}
                      very safe ·
                      <span className="text-yellow-400">≥ 3.0x</span>
                      {' '}
                      decent ·
                      <span className="text-red-400">&lt; 3.0x</span>
                      {' '}
                      caution
                    </div>
                    <button
                      type="button"
                      className="ml-2 underline cursor-pointer"
                      onClick={() => setShowSafuInfo(false)}
                    >
                      Hide
                    </button>
                  </>
                )}
          </>
        )}
      />
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
      <DetailRow
        label="Liquidations"
        value={
          isLiqCountLoading
            ? 'Loading\u2026'
            : liquidationCount != null
              ? (
                  <span className={liquidationCount === 0 ? 'text-red-500' : 'text-green-500'}>
                    {liquidationCount}
                  </span>
                )
              : '\u2014'
        }
      />

      <MarketCollateralReview market={market} />

      <SectionTitle title="Risk" />
      <DetailRow label="Bad Debt" value={formatUsd(market.badDebt.usd)} />
      <DetailRow
        label="Realized Bad Debt"
        value={formatUsd(market.realizedBadDebt.usd)}
      />
      <DetailRow
        label="Supplying Vaults"
        value={(
          <span className={supplyingVaultCount === 0 ? 'text-red-500' : supplyingVaultCount > 1 ? 'text-green-500' : undefined}>
            {supplyingVaultCount}
          </span>
        )}
      />

      <SectionTitle title="Supply Rates" />
      <DetailRow
        label="Instantaneous APR"
        value={liveSupplyApr != null ? formatPercent(liveSupplyApr) : '----'}
      />
      <DetailRow
        label="Rate at Target APR"
        value={liveRateAtTargetApr != null ? formatPercent(liveRateAtTargetApr) : '—'}
      />

      <DetailRow
        label="Daily APY"
        value={formatPercent(market.state.dailySupplyApy ?? market.state.dailyNetSupplyApy)}
      />
      <DetailRow
        label="Weekly APY"
        value={formatPercent(market.state.weeklySupplyApy ?? market.state.weeklyNetSupplyApy)}
      />
      <DetailRow
        label="Average APY"
        value={formatPercent(market.state.avgSupplyApy ?? market.state.avgNetSupplyApy)}
      />

    </div>
  )
}
