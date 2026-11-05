import { normalizeUnsignedInteger, validateSupplyRewards } from './market-responses'

export interface PositionPage {
  items: unknown[]
  pageInfo: { countTotal: number, count: number, limit: number, skip: number }
}

export function parsePositionPage(raw: unknown, first: number, skip: number): PositionPage {
  if (!raw || typeof raw !== 'object' || !('marketPositions' in raw))
    throw new Error('Invalid position discovery response')
  const page = raw.marketPositions
  if (!page || typeof page !== 'object' || !('items' in page) || !Array.isArray(page.items)
    || !('pageInfo' in page) || !page.pageInfo || typeof page.pageInfo !== 'object') {
    throw new Error('Missing position discovery items/pageInfo')
  }
  const info = page.pageInfo as Record<string, unknown>
  for (const field of ['countTotal', 'count', 'limit', 'skip']) {
    if (typeof info[field] !== 'number' || !Number.isSafeInteger(info[field]) || info[field] < 0)
      throw new Error(`Invalid position pagination ${field}`)
  }
  if (info.limit !== first || info.skip !== skip || info.count !== page.items.length
    || page.items.length > first || (info.countTotal as number) < skip + page.items.length) {
    throw new Error('Inconsistent position pagination')
  }
  return { items: page.items, pageInfo: info as PositionPage['pageInfo'] }
}

export async function collectPositionPages<T>(options: {
  pageSize: number
  fetchPage: (first: number, skip: number) => Promise<unknown>
  parseItem: (item: unknown) => T
  key: (item: T) => string
  signal?: AbortSignal
}) {
  const { pageSize, fetchPage, parseItem, key, signal } = options
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000)
    throw new Error('Invalid position page size')
  const positions = new Map<string, T>()
  let total: number | undefined
  let skip = 0
  for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
    signal?.throwIfAborted()
    const page = parsePositionPage(await fetchPage(pageSize, skip), pageSize, skip)
    signal?.throwIfAborted()
    if (total != null && page.pageInfo.countTotal !== total)
      throw new Error('Positions changed during pagination; retry discovery')
    total = page.pageInfo.countTotal
    for (const raw of page.items) {
      const item = parseItem(raw)
      positions.set(key(item), item)
    }
    skip += page.items.length
    if (skip >= total)
      return [...positions.values()]
    if (page.items.length === 0)
      throw new Error('Position pagination stopped before completion')
  }
  throw new Error('Position discovery exceeded pagination limit')
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid position object')
  return value as Record<string, unknown>
}
const quantity = (value: unknown) => normalizeUnsignedInteger(value, 'position quantity')

function address(value: unknown, bytes = 20) {
  if (typeof value !== 'string' || !new RegExp(`^0x[a-fA-F0-9]{${bytes * 2}}$`).test(value))
    throw new Error('Invalid position identity')
}
function finite(value: unknown, nullable = false) {
  if (nullable && value === null)
    return
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid position numeric value')
}

export function validatePositionIdentity(raw: unknown, crossChain: boolean) {
  const item = object(raw)
  const market = { ...object(item.market) }
  const state = { ...object(item.state) }
  const marketState = { ...object(market.state) }
  address(market.uniqueKey, 32)
  address(market.marketId, 32)
  state.supplyShares = quantity(state.supplyShares)
  marketState.supplyAssets = quantity(marketState.supplyAssets)
  marketState.supplyShares = quantity(marketState.supplyShares)
  if (!Array.isArray(market.warnings))
    throw new Error('Invalid position warnings')
  for (const rawWarning of market.warnings) {
    const warning = object(rawWarning)
    if (typeof warning.type !== 'string' || !['YELLOW', 'RED'].includes(String(warning.level)))
      throw new Error('Invalid position warning')
  }
  if (crossChain) {
    const chainId = object(object(market.morphoBlue).chain).id
    if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0)
      throw new Error('Invalid position chain')
  }
  else {
    for (const field of ['borrowShares', 'collateral'])
      state[field] = quantity(state[field])
    for (const field of ['loanAsset', 'collateralAsset']) {
      const asset = object(market[field])
      address(asset.address)
      if (typeof asset.symbol !== 'string' || !asset.symbol || typeof asset.decimals !== 'number'
        || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
        throw new Error('Invalid position asset')
      }
      if (asset.price != null) {
        const price = object(asset.price)
        finite(price.usd, true)
      }
    }
    if (market.oracle !== null)
      address(object(market.oracle).address)
    address(market.irmAddress)
    market.lltv = quantity(market.lltv)
    finite(marketState.netSupplyApy)
    finite(marketState.utilization)
    finite(marketState.supplyAssetsUsd, true)
    validateSupplyRewards(marketState.rewards)
  }
  return { ...item, state, market: { ...market, state: marketState } }
}
