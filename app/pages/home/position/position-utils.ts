import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { getMarketSupplyUsdWithFallback } from '~/lib/morpho/market-valuation'
import { getSuppliedAssetsFromShares } from '~/lib/morpho/position-visibility'

export function getMarketSupplyUsd(position: LiveMarketPosition) {
  return getMarketSupplyUsdWithFallback(position.market)
}

export function getPositionPrincipalUsd(position: LiveMarketPosition) {
  const marketSupplyUsd = getMarketSupplyUsd(position)
  if (marketSupplyUsd == null)
    return undefined

  const marketSupplyShares = BigInt(position.market.state.supplyShares)
  const userSupplyShares = BigInt(position.userState.supplyShares)
  if (marketSupplyShares === 0n)
    return undefined

  const shareRatio = Number(userSupplyShares) / Number(marketSupplyShares)
  if (!Number.isFinite(shareRatio) || shareRatio <= 0)
    return undefined

  return marketSupplyUsd * shareRatio
}

export function getPositionSuppliedAssets(position: LiveMarketPosition) {
  const liveSuppliedAssets = position.liveState?.projectedSuppliedAssets ?? position.liveState?.suppliedAssets
  if (liveSuppliedAssets != null)
    return liveSuppliedAssets

  return getSuppliedAssetsFromShares({
    userSupplyShares: position.userState.supplyShares,
    totalSupplyAssets: position.market.state.supplyAssets,
    totalSupplyShares: position.market.state.supplyShares,
  })
}

export function hasVisibleSupplyPosition(position: LiveMarketPosition) {
  return getPositionSuppliedAssets(position) > 0n
}

export function isVisiblePositionRow(position: LiveMarketPosition, options: { minSupplyUsd?: number } = {}) {
  const hasNonSupplyPosition = position.userState.borrowShares > 0n || position.userState.collateral > 0n
  const principalUsd = getPositionPrincipalUsd(position)
  if (!hasNonSupplyPosition && principalUsd != null && options.minSupplyUsd != null && principalUsd < options.minSupplyUsd)
    return false
  return hasNonSupplyPosition || hasVisibleSupplyPosition(position)
}

export function getPositionYearlyUsd(position: LiveMarketPosition, liveApr?: number) {
  if (liveApr == null)
    return undefined
  const userPrincipalUsd = getPositionPrincipalUsd(position)
  if (userPrincipalUsd == null)
    return undefined
  return userPrincipalUsd * liveApr
}
