const DEFAULT_MARKET_APR = '10'

const DEFAULT_MARKET_APR_BY_SYMBOL: Record<string, string> = {
  WETH: '4',
}

/**
 * Stablecoins that share the same Market APR because the swap spread
 * between them is essentially zero.
 */
export const STABLECOIN_APR_GROUP = [
  'USDC',
  'USDT',
  'USDS',
  'FRXUSD',
  'AUSD',
  'PYUSD',
] as const

export type StablecoinAprGroupSymbol = typeof STABLECOIN_APR_GROUP[number]

const STABLECOIN_APR_GROUP_SET = new Set<string>(STABLECOIN_APR_GROUP)

export type MarketAprBySymbolMap = Record<string, string>

export function normalizeMarketAprAssetSymbol(symbol?: string | null) {
  return symbol?.trim().toUpperCase()
}

/**
 * Returns the canonical symbol for Market APR lookup.
 * For stablecoins in the grouped set, returns a single canonical key
 * so all grouped symbols share the same stored value.
 */
export function getMarketAprCanonicalSymbol(symbol?: string | null): string | undefined {
  const normalized = normalizeMarketAprAssetSymbol(symbol)
  if (!normalized)
    return undefined
  if (STABLECOIN_APR_GROUP_SET.has(normalized))
    return STABLECOIN_APR_GROUP[0] // 'USDC' is the canonical key
  return normalized
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
  const canonical = getMarketAprCanonicalSymbol(symbol)
  if (!canonical)
    return undefined
  // Try the canonical key first, then fall back to the literal symbol.
  const remembered = marketAprBySymbol?.[canonical] ?? marketAprBySymbol?.[normalizeMarketAprAssetSymbol(symbol)!]
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

/**
 * When saving a Market APR value, propagate it to all symbols in the same
 * stablecoin group so that switching assets shows the shared value.
 */
export function setMarketAprBySymbolWithGroup(
  symbol: string | null | undefined,
  value: string,
  prev: MarketAprBySymbolMap,
): MarketAprBySymbolMap {
  const normalized = normalizeMarketAprAssetSymbol(symbol)
  if (!normalized)
    return prev

  const trimmed = value.trim()
  const next = { ...prev }

  if (!trimmed) {
    // Clearing: remove all symbols in the group
    if (STABLECOIN_APR_GROUP_SET.has(normalized)) {
      for (const s of STABLECOIN_APR_GROUP)
        delete next[s]
    }
    else {
      delete next[normalized]
    }
    return next
  }

  if (STABLECOIN_APR_GROUP_SET.has(normalized)) {
    // Stablecoin group: propagate to all symbols
    for (const s of STABLECOIN_APR_GROUP)
      next[s] = trimmed
  }
  else {
    next[normalized] = trimmed
  }

  return next
}

export { DEFAULT_MARKET_APR }
