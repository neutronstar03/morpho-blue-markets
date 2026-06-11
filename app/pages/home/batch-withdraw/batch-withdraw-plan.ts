import type { BatchWithdrawPlanState, LoanAssetOption, MarketPlanItem } from './shared'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import type { SupplyOptimizerMarketSnapshot } from '~/lib/optimizer/supply-optimizer'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { projectMorphoMarketAccrual } from '~/lib/morpho/project-accrual'
import { toMorphoAssetsDown, toMorphoSharesDown, toMorphoSharesUp } from '~/lib/morpho/share-math'
import { computeSupplyAfterDeltaWad } from '~/lib/optimizer/supply-optimizer'
import { max0, minBigint } from './shared'

interface BuildBatchWithdrawMarketItemsArgs {
  selectedOption?: LoanAssetOption
  selectedUserMarkets: LiveMarketPosition[]
  marketReads: readonly any[] | undefined
  rateReads: readonly any[] | undefined
  nowSec: bigint
}

interface BuildBatchWithdrawPlanArgs {
  computedMarkets: { ok: false, error: string | undefined, items: MarketPlanItem[] } | { ok: true, error: undefined, items: MarketPlanItem[] }
  selectedOption?: LoanAssetOption
  parsedWithdrawAssets: bigint
}

export function buildBatchWithdrawMarketItems({
  selectedOption,
  selectedUserMarkets,
  marketReads,
  rateReads,
  nowSec,
}: BuildBatchWithdrawMarketItemsArgs) {
  if (!selectedOption)
    return { ok: false as const, error: undefined, items: [] as MarketPlanItem[] }
  if (selectedUserMarkets.length === 0)
    return { ok: false as const, error: 'No supply positions for this asset', items: [] as MarketPlanItem[] }

  if (!marketReads || marketReads.length !== selectedUserMarkets.length)
    return { ok: false as const, error: 'Loading market state…', items: [] as MarketPlanItem[] }
  if (!rateReads || rateReads.length !== selectedUserMarkets.length)
    return { ok: false as const, error: 'Loading IRM rates…', items: [] as MarketPlanItem[] }

  const items: MarketPlanItem[] = []

  for (let i = 0; i < selectedUserMarkets.length; i++) {
    const p = selectedUserMarkets[i]
    const mRes = marketReads[i]
    const rRes = rateReads[i]
    if (mRes?.status !== 'success' || !mRes.result)
      return { ok: false as const, error: 'Missing onchain market data (retry)', items: [] as MarketPlanItem[] }
    if (rRes?.status !== 'success' || rRes.result == null)
      return { ok: false as const, error: 'Missing IRM data (retry)', items: [] as MarketPlanItem[] }

    const rawMarketState = normalizeMorphoMarketState(mRes.result)
    if (!rawMarketState)
      return { ok: false as const, error: 'Failed to decode market state', items: [] as MarketPlanItem[] }
    const st = projectMorphoMarketAccrual({
      marketId: p.market.uniqueKey as `0x${string}`,
      market: rawMarketState,
      rateAtTarget: rRes.result as bigint,
      timestamp: nowSec,
    })

    const totalSupplyAssets = st.totalSupplyAssets
    const totalSupplyShares = st.totalSupplyShares
    const totalBorrowAssets = st.totalBorrowAssets
    const userSupplyShares = p.userState.supplyShares
    if (totalSupplyShares <= 0n || userSupplyShares <= 0n)
      continue

    const suppliedAssets = toMorphoAssetsDown(userSupplyShares, totalSupplyAssets, totalSupplyShares)
    if (suppliedAssets <= 0n)
      continue

    const liquidityAssets = max0(totalSupplyAssets - totalBorrowAssets)
    const liquidityShares = toMorphoSharesDown(liquidityAssets, totalSupplyAssets, totalSupplyShares)
    const maxWithdrawSharesRaw = suppliedAssets <= liquidityAssets
      ? userSupplyShares
      : minBigint(userSupplyShares, liquidityShares)
    const maxWithdrawShares = maxWithdrawSharesRaw
    const maxWithdrawAssets = totalSupplyShares > 0n && maxWithdrawShares > 0n
      ? toMorphoAssetsDown(maxWithdrawShares, totalSupplyAssets, totalSupplyShares)
      : 0n
    const snapshot: SupplyOptimizerMarketSnapshot = {
      marketId: p.market.uniqueKey as `0x${string}`,
      uniqueKey: p.market.uniqueKey as `0x${string}`,
      totalSupplyAssets,
      totalBorrowAssets,
      lastUpdate: st.lastUpdate,
      feeWad: st.fee,
      rateAtTarget: rRes.result as bigint,
    }

    const apr = computeSupplyAfterDeltaWad({ market: snapshot, deltaSupplyAssets: 0n, timestamp: nowSec }).supplyAprWad

    items.push({
      marketId: p.market.uniqueKey as `0x${string}`,
      collateralSymbol: p.market.collateralAsset.symbol,
      userSupplyShares,
      suppliedAssets,
      marketTotalSupplyAssets: totalSupplyAssets,
      marketTotalSupplyShares: totalSupplyShares,
      liquidityAssets,
      liquidityShares,
      maxWithdrawShares,
      maxWithdrawAssets,
      supplyAprWad: apr,
      plannedWithdrawAssets: 0n,
      plannedWithdrawShares: 0n,
      fullExit: false,
    })
  }

  if (items.length === 0) {
    return {
      ok: false as const,
      error: `No ${selectedOption.symbol} is currently withdrawable. Your supply is still deposited, but all visible liquidity is borrowed right now. Try again later or withdraw from individual markets as liquidity returns.`,
      items: [] as MarketPlanItem[],
    }
  }

  return { ok: true as const, error: undefined, items }
}

export function buildBatchWithdrawPlan({
  computedMarkets,
  selectedOption,
  parsedWithdrawAssets,
}: BuildBatchWithdrawPlanArgs): BatchWithdrawPlanState {
  if (!computedMarkets.ok)
    return { ok: false, error: computedMarkets.error, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied: 0n, totalWithdrawable: 0n }
  const base = computedMarkets.items

  const totalSupplied = base.reduce((sum, x) => sum + x.suppliedAssets, 0n)
  const totalWithdrawable = base.reduce((sum, x) => sum + x.maxWithdrawAssets, 0n)

  if (!selectedOption)
    return { ok: false, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }
  if (parsedWithdrawAssets <= 0n)
    return { ok: false, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }

  const sorted = [...base].sort((a, b) => {
    if (a.supplyAprWad === b.supplyAprWad)
      return a.marketId.localeCompare(b.marketId)
    return a.supplyAprWad < b.supplyAprWad ? -1 : 1
  })

  if (parsedWithdrawAssets >= totalWithdrawable) {
    const out = sorted
      .filter(m => m.maxWithdrawShares > 0n)
      .map(m => ({
        ...m,
        plannedWithdrawShares: m.maxWithdrawShares,
        plannedWithdrawAssets: m.maxWithdrawAssets,
        fullExit: m.maxWithdrawShares === m.userSupplyShares,
      }))
    return { ok: true, error: undefined, items: out, remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }
  }

  let remainingAssets = parsedWithdrawAssets
  const plannedSharesById = new Map<string, bigint>()

  for (const m of sorted) {
    if (remainingAssets <= 0n)
      break
    if (m.maxWithdrawShares <= 0n)
      continue

    const desiredShares = toMorphoSharesDown(remainingAssets, m.marketTotalSupplyAssets, m.marketTotalSupplyShares)
    const sharesToWithdraw = minBigint(desiredShares, m.maxWithdrawShares)
    if (sharesToWithdraw <= 0n)
      continue

    plannedSharesById.set(m.marketId.toLowerCase(), sharesToWithdraw)
    remainingAssets -= assetsFromShares(m, sharesToWithdraw)
  }

  let dustPass = 0
  // A few cleanup passes reclaim leftover assets caused by share/asset rounding without overcomplicating the planner.
  while (remainingAssets > 0n && dustPass < 5) {
    dustPass++
    let progressed = false

    for (const m of sorted) {
      if (remainingAssets <= 0n)
        break
      const id = m.marketId.toLowerCase()
      const currentShares = plannedSharesById.get(id) ?? 0n
      const slack = m.maxWithdrawShares - currentShares
      if (slack <= 0n)
        continue

      const currentAssets = assetsFromShares(m, currentShares)
      const targetAssets = currentAssets + remainingAssets
      const requiredShares = toMorphoSharesUp(targetAssets, m.marketTotalSupplyAssets, m.marketTotalSupplyShares)
      let deltaShares = requiredShares - currentShares
      if (deltaShares <= 0n)
        continue
      if (deltaShares > slack)
        deltaShares = slack

      const nextShares = currentShares + deltaShares
      const nextAssets = assetsFromShares(m, nextShares)
      const deltaAssets = nextAssets - currentAssets
      if (deltaAssets <= 0n)
        continue

      plannedSharesById.set(id, nextShares)
      remainingAssets -= deltaAssets
      progressed = true
    }

    if (!progressed)
      break
  }

  const out: MarketPlanItem[] = []
  for (const m of sorted) {
    const shares = plannedSharesById.get(m.marketId.toLowerCase()) ?? 0n
    if (shares <= 0n)
      continue
    out.push({
      ...m,
      plannedWithdrawShares: shares,
      plannedWithdrawAssets: assetsFromShares(m, shares),
      fullExit: shares === m.userSupplyShares,
    })
  }

  const overWithdrawAssets = remainingAssets < 0n ? -remainingAssets : 0n

  return {
    ok: true,
    error: undefined,
    items: out,
    remaining: remainingAssets > 0n ? remainingAssets : 0n,
    overWithdrawAssets,
    totalSupplied,
    totalWithdrawable,
  }
}

function assetsFromShares(m: MarketPlanItem, shares: bigint): bigint {
  if (shares <= 0n || m.marketTotalSupplyShares <= 0n)
    return 0n
  return toMorphoAssetsDown(shares, m.marketTotalSupplyAssets, m.marketTotalSupplyShares)
}
