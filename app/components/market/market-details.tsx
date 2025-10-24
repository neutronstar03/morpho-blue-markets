import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid'
import { useState } from 'react'
import { formatLltv, formatPercent, formatUsd } from '~/lib/formatters'
import { useTokenLiquidity } from '~/lib/hooks/use-token-liquidity'
import { Card } from '../ui/card'

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
    <div className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-b-0">
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

export function MarketDetails({ market }: MarketDetailsProps) {
  const { data: liquidityStr, isLoading: isLiqLoading } = useTokenLiquidity({
    chainId: market.morphoBlue.chain.id,
    tokenAddress: market.collateralAsset.address,
  })
  const liquidityUsd = liquidityStr ? Number(liquidityStr) : undefined
  const effectiveLiquidityUsd = liquidityUsd != null ? liquidityUsd / 2 : undefined
  const totalSupplyUsd = market.state.supplyAssetsUsd
  const safuness = effectiveLiquidityUsd != null && totalSupplyUsd > 0 ? (effectiveLiquidityUsd / totalSupplyUsd) : undefined

  const [showLiqInfo, setShowLiqInfo] = useState(false)
  const [showSafuInfo, setShowSafuInfo] = useState(false)

  const liqTip = 'Estimated aggregate DEX liquidity for this collateral token on this chain. We conservatively assume ~50% of pool liquidity is directly usable in the collateral token.'
  const safuTip = 'SAFUNESS = usable liquidity / total supply. 1.0x means usable liquidity equals total supply; liquidation may incur significant price impact. Assumes ~50% in collateral. ≥3.0x safer, <1.0x risky.'

  function safunessColor(ratio: number | undefined) {
    if (ratio == null)
      return 'text-gray-400'
    if (ratio >= 5)
      return 'text-green-400'
    if (ratio >= 3)
      return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <Card className="p-6 bg-gray-800/50">
      <h2 className="text-xl font-semibold text-white mb-4">Market Details</h2>

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
              <span className={safunessColor(safuness)}>
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

      <SectionTitle title="Risk" />
      <DetailRow label="Bad Debt" value={formatUsd(market.badDebt.usd)} />
      <DetailRow
        label="Realized Bad Debt"
        value={formatUsd(market.realizedBadDebt.usd)}
      />
      <DetailRow
        label="Supplying Vaults"
        value={market.supplyingVaults.length}
      />

      <SectionTitle title="Supply APY" />
      <DetailRow
        label="Current"
        value={formatPercent(market.state.netSupplyApy)}
      />

      <DetailRow
        label="Daily"
        value={formatPercent(market.state.dailyNetSupplyApy)}
      />
      <DetailRow
        label="Weekly"
        value={formatPercent(market.state.weeklyNetSupplyApy)}
      />
      <DetailRow
        label="Average"
        value={formatPercent(market.state.avgNetSupplyApy)}
      />

      <SectionTitle title="Borrow APY" />
      <DetailRow
        label="Current"
        value={formatPercent(market.state.netBorrowApy)}
      />
      <DetailRow
        label="Daily"
        value={formatPercent(market.state.dailyNetBorrowApy)}
      />
      <DetailRow
        label="Weekly"
        value={formatPercent(market.state.weeklyNetBorrowApy)}
      />
      <DetailRow
        label="Average"
        value={formatPercent(market.state.avgNetBorrowApy)}
      />
    </Card>
  )
}
