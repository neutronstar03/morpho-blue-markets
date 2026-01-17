import blacklistAssets from './blacklist.assets.json'
import blacklistMarkets from './blacklist.markets.json'

const BLACKLISTED_MARKET_IDS_BY_CHAIN: Record<number, Set<string>> = blacklistMarkets.reduce(
  (acc, entry) => {
    const chainId = entry.chainId
    if (!acc[chainId])
      acc[chainId] = new Set()
    acc[chainId].add(entry.uniqueKey.toLowerCase())
    return acc
  },
  {} as Record<number, Set<string>>,
)

const BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN: Record<number, Set<string>> = Object.fromEntries(
  Object.entries(blacklistAssets as Record<string, Array<{ assetContract: string }>>).map(
    ([chainId, assets]) => [
      Number(chainId),
      new Set(assets.map(asset => asset.assetContract.toLowerCase())),
    ],
  ),
)

const PENDLE_MONTHS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
}

function normalizeId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

function formatTodayPendleSortable() {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())
  return Number(`${year}${month}${day}`)
}

function parsePendleExpiryFromSymbol(symbol?: string | null) {
  if (!symbol)
    return undefined
  const match = /(?:^|-)\d{2}[A-Z]{3}\d{4}(?:$|\s)/.exec(symbol.toUpperCase())
  if (!match)
    return undefined
  const dateToken = match[0].replace(/(^-|\s$)/g, '')
  const day = dateToken.slice(0, 2)
  const monthToken = dateToken.slice(2, 5)
  const year = dateToken.slice(5)
  const month = PENDLE_MONTHS[monthToken]
  if (!month)
    return undefined
  return Number(`${year}${month}${day}`)
}

function isPendleSymbolExpired(symbol?: string | null) {
  if (!symbol)
    return false
  const normalized = symbol.toUpperCase()
  if (!normalized.startsWith('PT-') && !normalized.startsWith('WRAPPED-LP-'))
    return false
  const expiry = parsePendleExpiryFromSymbol(normalized)
  if (!expiry)
    return false
  return expiry < formatTodayPendleSortable()
}

function hasValueInChainMap(
  map: Record<number, Set<string>>,
  value: string | null | undefined,
  chainId?: number,
) {
  const normalized = normalizeId(value)
  if (!normalized)
    return false
  if (chainId != null) {
    const set = map[chainId]
    return set ? set.has(normalized) : false
  }
  return Object.values(map).some(set => set.has(normalized))
}

export function isAssetBlacklisted(address?: string | null, chainId?: number) {
  return hasValueInChainMap(BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN, address, chainId)
}

export function isMarketIdBlacklisted(uniqueKey?: string | null, chainId?: number) {
  return hasValueInChainMap(BLACKLISTED_MARKET_IDS_BY_CHAIN, uniqueKey, chainId)
}

export function isMarketBlacklisted(args: {
  uniqueKey?: string | null
  loanAssetAddress?: string | null
  collateralAssetAddress?: string | null
  loanAssetSymbol?: string | null
  collateralAssetSymbol?: string | null
  chainId?: number
}) {
  return (
    isMarketIdBlacklisted(args.uniqueKey, args.chainId)
    || isAssetBlacklisted(args.loanAssetAddress, args.chainId)
    || isAssetBlacklisted(args.collateralAssetAddress, args.chainId)
    || isPendleSymbolExpired(args.loanAssetSymbol)
    || isPendleSymbolExpired(args.collateralAssetSymbol)
  )
}

export function filterBlacklistedMarkets<T>(
  markets: T[],
  getArgs: (market: T) => {
    uniqueKey?: string | null
    loanAssetAddress?: string | null
    collateralAssetAddress?: string | null
    loanAssetSymbol?: string | null
    collateralAssetSymbol?: string | null
    chainId?: number
  },
) {
  return markets.filter(market => !isMarketBlacklisted(getArgs(market)))
}
