const DEFAULT_MARKET_APR = '10'

const DEFAULT_MARKET_APR_BY_SYMBOL: Record<string, string> = {
  WETH: '4',
}

export type MarketAprBySymbolMap = Record<string, string>

export function normalizeMarketAprAssetSymbol(symbol?: string | null) {
  return symbol?.trim().toUpperCase()
}

export function getDefaultMarketAprByAssetSymbol(symbol?: string | null) {
  const normalizedSymbol = normalizeMarketAprAssetSymbol(symbol)
  if (!normalizedSymbol)
    return DEFAULT_MARKET_APR
  return DEFAULT_MARKET_APR_BY_SYMBOL[normalizedSymbol] ?? DEFAULT_MARKET_APR
}

export function getRememberedMarketAprByAssetSymbol(
  symbol: string | null | undefined,
  marketAprBySymbol: MarketAprBySymbolMap | null | undefined,
) {
  const normalizedSymbol = normalizeMarketAprAssetSymbol(symbol)
  if (!normalizedSymbol)
    return undefined
  const remembered = marketAprBySymbol?.[normalizedSymbol]
  if (typeof remembered !== 'string')
    return undefined
  const trimmed = remembered.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function resolveMarketAprByAssetSymbol(
  symbol: string | null | undefined,
  marketAprBySymbol: MarketAprBySymbolMap | null | undefined,
) {
  return getRememberedMarketAprByAssetSymbol(symbol, marketAprBySymbol) ?? getDefaultMarketAprByAssetSymbol(symbol)
}

export { DEFAULT_MARKET_APR }
