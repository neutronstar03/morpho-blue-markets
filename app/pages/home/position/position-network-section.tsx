import type { Portfolio, PositionGroup } from './position-types'
import type { MarketAprBySymbolMap } from '~/lib/default-market-apr'
import type { MarketRiskInput } from '~/lib/market-risk/types'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getSupportedChainName } from '~/lib/addresses'
import { trackEvent } from '~/lib/analytics'
import { CHAIN_ICON_BY_ID } from '~/lib/chain-icons'
import { resolveMarketAprByAssetSymbol } from '~/lib/default-market-apr'
import { formatBigintShort, formatUsd } from '~/lib/formatters'
import { useLiveMarketApr } from '~/lib/hooks/rpc/use-live-market-apr'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { useMarketIdBlacklistPredicate } from '~/lib/market-blacklist'
import { useMarketRiskStatusMap } from '~/lib/market-risk/hooks'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { cn } from '~/lib/utils'
import { PositionGroups } from './position-groups'
import { getMarketSupplyUsd, getPositionSuppliedAssets, hasVisibleSupplyPosition } from './position-utils'
import { usePositionGroups } from './use-position-groups'

const OPEN_SUPPLY_APR_OPTIMIZER_EVENT = 'open-supply-apr-optimizer'

function computePortfolio(
  positions: LiveMarketPosition[] | undefined,
  aprByMarketKey: Record<string, { apr?: number }>,
): Portfolio {
  if (!positions?.length) {
    return { dailyUsd: undefined, yearlyUsd: undefined, weightedAprPct: undefined, totalAssets: undefined, totalAssetsUsd: undefined, totalAssetsSymbol: undefined, totalAssetsDecimals: undefined }
  }

  let totalAssets: bigint | undefined
  let totalAssetsSymbol: string | undefined
  let totalAssetsDecimals: number | undefined
  let totalPrincipalUsd = 0
  let totalDailyUsd = 0
  let totalAprWeighted = 0

  const firstLoanAssetAddress = positions[0]?.market.loanAsset.address
  const firstLoanAssetSymbol = positions[0]?.market.loanAsset.symbol
  const firstLoanAssetDecimals = positions[0]?.market.loanAsset.decimals ?? 18
  const allSameAsset = positions.every(p => p.market.loanAsset.address === firstLoanAssetAddress)

  if (allSameAsset && firstLoanAssetAddress) {
    totalAssets = 0n
    totalAssetsSymbol = firstLoanAssetSymbol
    totalAssetsDecimals = firstLoanAssetDecimals
  }

  for (const p of positions) {
    const marketSupplyShares = BigInt(p.market.state.supplyShares)
    const userSupplyShares = BigInt(p.userState.supplyShares)
    const marketSupplyUsd = getMarketSupplyUsd(p)

    if (marketSupplyShares === 0n || marketSupplyUsd == null)
      continue

    const shareRatio = Number(userSupplyShares) / Number(marketSupplyShares)
    if (!Number.isFinite(shareRatio) || shareRatio <= 0)
      continue

    const userPrincipalUsd = marketSupplyUsd * shareRatio
    const marketApr = aprByMarketKey[p.market.uniqueKey]?.apr
    if (marketApr == null)
      continue
    const dailyRate = marketApr / 365
    const dailyUsd = userPrincipalUsd * dailyRate

    totalPrincipalUsd += userPrincipalUsd
    totalDailyUsd += dailyUsd
    totalAprWeighted += userPrincipalUsd * marketApr

    if (allSameAsset && totalAssets !== undefined)
      totalAssets += getPositionSuppliedAssets(p)
  }

  const weightedAprPct = totalPrincipalUsd > 0 ? (totalAprWeighted / totalPrincipalUsd) * 100 : undefined
  return {
    dailyUsd: totalDailyUsd || undefined,
    yearlyUsd: totalAprWeighted || undefined,
    weightedAprPct,
    totalAssets: totalAssets === 0n ? undefined : totalAssets,
    totalAssetsUsd: totalPrincipalUsd || undefined,
    totalAssetsSymbol,
    totalAssetsDecimals,
  }
}

export function PositionNetworkSection({
  chainId,
  address,
  defaultOpen,
  marketAprBySymbol,
  onPortfolioChange,
}: {
  chainId: number
  address: `0x${string}`
  defaultOpen: boolean
  marketAprBySymbol: MarketAprBySymbolMap
  onPortfolioChange?: (chainId: number, state: { portfolio: Portfolio, positionCount: number, isLoading: boolean }) => void
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [assetSummaryMode, setAssetSummaryMode] = useState<'total' | 'native' | 'yearly'>('total')
  const setOptimizerPreset = useHomeMagicOptimizerStore(state => state.setOptimizerPreset)
  const chainName = getSupportedChainName(chainId)
  const Icon = CHAIN_ICON_BY_ID[chainId]

  const { data: positions, isLoading } = useLiveMarketPositions({ address, chainId })
  const markets = useMemo(() => (positions ?? []).map(p => p.market), [positions])
  const { aprByMarketKey } = useLiveMarketApr(markets, { chainId })
  const isMarketIdBlacklisted = useMarketIdBlacklistPredicate()

  const visiblePositions = useMemo(() => {
    if (!positions)
      return []
    return positions.filter((position) => {
      if (isMarketIdBlacklisted(position.market.uniqueKey, chainId))
        return false
      const hasNonSupplyPosition = position.userState.borrowShares > 0n || position.userState.collateral > 0n
      return hasNonSupplyPosition || hasVisibleSupplyPosition(position)
    })
  }, [chainId, isMarketIdBlacklisted, positions])

  const riskMarkets = useMemo<MarketRiskInput[]>(() => {
    return visiblePositions.map(p => ({
      chainId,
      uniqueKey: p.market.uniqueKey,
      loanAssetAddress: p.market.loanAsset?.address,
      loanAssetSymbol: p.market.loanAsset?.symbol,
      collateralAssetAddress: p.market.collateralAsset?.address,
      collateralAssetSymbol: p.market.collateralAsset?.symbol,
      warnings: p.market.warnings,
      oracleAddress: p.market.oracleAddress,
    }))
  }, [chainId, visiblePositions])
  const riskStatusByKey = useMarketRiskStatusMap(riskMarkets)
  const portfolio = useMemo(() => computePortfolio(visiblePositions, aprByMarketKey), [visiblePositions, aprByMarketKey])
  const groupedPositions = usePositionGroups(visiblePositions, chainId, aprByMarketKey)
  const visibleAssetCount = useMemo(() => {
    const assets = new Set<string>()
    for (const position of visiblePositions)
      assets.add(position.market.loanAsset.address.toLowerCase())
    return assets.size
  }, [visiblePositions])
  const positionSummary = visiblePositions.length === 1
    ? '1 position'
    : visibleAssetCount > 1
      ? `${visiblePositions.length} positions, ${visibleAssetCount} assets`
      : `${visiblePositions.length} positions`

  useEffect(() => {
    onPortfolioChange?.(chainId, {
      portfolio,
      positionCount: visiblePositions.length,
      isLoading,
    })
  }, [chainId, isLoading, onPortfolioChange, portfolio, visiblePositions.length])

  const handleOpenOptimizerForGroup = (group: PositionGroup) => {
    const firstPosition = group.positions[0]
    if (!firstPosition)
      return

    trackEvent('position_optimize_clicked', {
      loanAsset: group.loanAssetSymbol,
      chainId,
    })

    setOptimizerPreset({
      chainId,
      loanAssetAddress: firstPosition.market.loanAsset.address,
      loanAssetSymbol: group.loanAssetSymbol,
      loanAssetDecimals: firstPosition.market.loanAsset.decimals ?? 18,
      marketApr: resolveMarketAprByAssetSymbol(group.loanAssetSymbol, marketAprBySymbol),
      newDepositAmount: '0',
      maxMarketsUsed: 6,
      usePrecomputedIfFresh: false,
    })

    window.dispatchEvent(new Event(OPEN_SUPPLY_APR_OPTIMIZER_EVENT))
    window.requestAnimationFrame(() => {
      const el = document.querySelector('[data-testid="supply-apr-optimizer-card"]') as HTMLElement | null
      if (!el)
        return
      const top = el.getBoundingClientRect().top + window.scrollY - 88
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    })
  }

  if (!isLoading && visiblePositions.length === 0)
    return null

  return (
    <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950/30" data-testid="positions-chain-section">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-900/70 sm:px-4"
        aria-expanded={isOpen}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-800">
          {Icon
            ? <Icon size={24} variant="branded" className="h-6 w-6" />
            : <span className="text-sm font-semibold text-white">{chainName.slice(0, 1)}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white sm:text-base">{chainName}</span>
          <span className="block text-xs text-gray-500">
            {isLoading && visiblePositions.length === 0 ? 'Loading positions...' : positionSummary}
          </span>
        </span>
        <span className="grid shrink-0 grid-cols-2 gap-3 text-right sm:gap-6">
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">Assets</span>
            <span className="block text-xs font-medium text-white sm:text-sm">
              {portfolio.totalAssetsUsd != null
                ? formatUsd(portfolio.totalAssetsUsd)
                : portfolio.totalAssets != null && portfolio.totalAssetsSymbol && portfolio.totalAssetsDecimals != null
                  ? `${formatBigintShort(portfolio.totalAssets, portfolio.totalAssetsDecimals)} ${portfolio.totalAssetsSymbol}`
                  : '—'}
            </span>
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-gray-500 sm:text-xs">APR</span>
            <span className="block text-xs font-medium text-white sm:text-sm">{portfolio.weightedAprPct != null ? `${portfolio.weightedAprPct.toFixed(2)}%` : '—'}</span>
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="border-t border-gray-800 px-3 py-4 sm:px-4">
          {isLoading && visiblePositions.length === 0
            ? (
                <p className="text-sm text-gray-400">
                  Loading
                  {chainName}
                  {' '}
                  positions...
                </p>
              )
            : (
                <PositionGroups
                  groups={groupedPositions}
                  chainId={chainId}
                  portfolioTotalAssetsUsd={portfolio.totalAssetsUsd}
                  aprByMarketKey={aprByMarketKey}
                  riskStatusByKey={riskStatusByKey}
                  summaryMode={assetSummaryMode}
                  onToggleSummaryMode={() => setAssetSummaryMode((mode) => {
                    if (mode === 'total')
                      return 'native'
                    if (mode === 'native')
                      return 'yearly'
                    return 'total'
                  })}
                  onSelectLoanAsset={handleOpenOptimizerForGroup}
                />
              )}
        </div>
      )}
    </section>
  )
}
