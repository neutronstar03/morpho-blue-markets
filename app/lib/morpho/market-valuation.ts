export interface MarketLikeWithUsdFallback {
  loanAsset: {
    decimals?: number | null
    price?: {
      usd?: number | null
    } | null
  }
  state: {
    supplyAssets: string | number | bigint
    supplyAssetsUsd?: number | null
  }
}

export function getMarketSupplyUsdWithFallback(market: MarketLikeWithUsdFallback) {
  const marketSupplyUsd = market.state.supplyAssetsUsd
  if (typeof marketSupplyUsd === 'number' && Number.isFinite(marketSupplyUsd))
    return marketSupplyUsd

  const priceUsd = market.loanAsset.price?.usd
  if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd <= 0)
    return undefined

  const marketSupplyAssets = Number(market.state.supplyAssets)
  const decimals = market.loanAsset.decimals ?? 18
  if (!Number.isFinite(marketSupplyAssets) || marketSupplyAssets < 0)
    return undefined

  return (marketSupplyAssets / 10 ** decimals) * priceUsd
}
