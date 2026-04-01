import type { LiveMarketPosition } from '~/lib/hooks/rpc/use-live-market-positions'

export function getPositionPrincipalUsd(position: LiveMarketPosition) {
  const marketSupplyUsd = position.market.state.supplyAssetsUsd
  if (typeof marketSupplyUsd !== 'number')
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

export function getPositionYearlyUsd(position: LiveMarketPosition, liveApr?: number) {
  if (liveApr == null)
    return undefined
  const userPrincipalUsd = getPositionPrincipalUsd(position)
  if (userPrincipalUsd == null)
    return undefined
  return userPrincipalUsd * liveApr
}
