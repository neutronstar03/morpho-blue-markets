import type { UserSupplyPosition } from './supply-optimizer'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { getMarketSupplyUsdWithFallback } from '~/lib/morpho/market-valuation'
import { getSuppliedAssetsFromShares } from '~/lib/morpho/position-visibility'

// Automatic suggestions should ignore dust across the whole loan asset balance.
export const MIN_HOME_SCAN_PRINCIPAL_USD = 1

export function getHomeScanPortfolio(markets: LiveMarketPosition[]): {
  positions: UserSupplyPosition[]
  principalUsd: number | null
} {
  const positions: UserSupplyPosition[] = []
  let principalUsd: number | null = 0

  for (const { market, userState } of markets) {
    const suppliedAssets = getSuppliedAssetsFromShares({
      userSupplyShares: userState.supplyShares,
      totalSupplyAssets: market.state.supplyAssets,
      totalSupplyShares: market.state.supplyShares,
    })
    if (suppliedAssets === 0n)
      continue

    positions.push({ marketId: market.uniqueKey as `0x${string}`, suppliedAssets })
    if (principalUsd === null)
      continue

    const marketSupplyUsd = getMarketSupplyUsdWithFallback(market)
    const positionUsd = (marketSupplyUsd ?? 0) * (Number(suppliedAssets) / Number(market.state.supplyAssets))
    principalUsd = Number.isFinite(principalUsd + positionUsd) && positionUsd > 0
      ? principalUsd + positionUsd
      : null
  }

  return { positions, principalUsd }
}
