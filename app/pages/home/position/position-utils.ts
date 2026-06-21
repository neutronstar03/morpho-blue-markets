import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { isMarketLocallyMarkedLostValue } from '~/lib/local-market-exclusions'
import { getMarketSupplyUsdWithFallback } from '~/lib/morpho/market-valuation'
import { getSuppliedAssetsFromShares } from '~/lib/morpho/position-visibility'

export function isVaultV2Position(position: LiveMarketPosition) {
  return position.source?.kind === 'vaultV2'
}

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

export function isVisibleDirectMarketPosition(position: LiveMarketPosition, options: { chainId: number, minSupplyUsd?: number }) {
  if (isVaultV2Position(position))
    return false
  if (isMarketLocallyMarkedLostValue(options.chainId, position.market.uniqueKey))
    return false
  return isVisiblePositionRow(position, { minSupplyUsd: options.minSupplyUsd })
}

export function isVisibleVaultV2Position(position: LiveMarketPosition, options: { minSupplyUsd?: number } = {}) {
  return isVaultV2Position(position) && isVisiblePositionRow(position, { minSupplyUsd: options.minSupplyUsd })
}

export function getPositionYearlyUsd(position: LiveMarketPosition, liveApr?: number) {
  if (liveApr == null)
    return undefined
  const userPrincipalUsd = getPositionPrincipalUsd(position)
  if (userPrincipalUsd == null)
    return undefined
  return userPrincipalUsd * liveApr
}
