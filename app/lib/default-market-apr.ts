const DEFAULT_MARKET_APR = '10'

const DEFAULT_MARKET_APR_BY_SYMBOL: Record<string, string> = {
  WETH: '4',
}

export function getDefaultMarketAprByAssetSymbol(symbol?: string | null) {
  const normalizedSymbol = symbol?.trim().toUpperCase()
  if (!normalizedSymbol)
    return DEFAULT_MARKET_APR
  return DEFAULT_MARKET_APR_BY_SYMBOL[normalizedSymbol] ?? DEFAULT_MARKET_APR
}

export { DEFAULT_MARKET_APR }
