import type { RawMarketOracle } from './market-oracle'
import type { MorphoMarket, QueryMarketsResult } from './queries/list-markets'
import type { SingleMorphoMarket } from './queries/market-detail'
import type { SupplyMarketData } from './queries/markets-by-chain'
import { normalizeMarketOracle, normalizeMarketOracles } from './market-oracle'

export class ApiContractError extends Error {
  name = 'ApiContractError'
}
export class UnavailableMarketMetadataError extends Error {
  name = 'UnavailableMarketMetadataError'
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiContractError(`Invalid ${name}`)
  return value as Record<string, unknown>
}
function address(value: unknown, name: string, bytes = 20) {
  if (typeof value !== 'string' || !new RegExp(`^0x[a-fA-F0-9]{${bytes * 2}}$`).test(value))
    throw new ApiContractError(`Invalid ${name}`)
}
function text(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new ApiContractError(`Invalid ${name}`)
}
export function normalizeUnsignedInteger(value: unknown, name: string): string {
  if (typeof value === 'string' && /^\d+$/.test(value))
    return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return String(value)
  throw new ApiContractError(`Invalid ${name}`)
}
const quantity = normalizeUnsignedInteger

function number(value: unknown, name: string, nullable = false) {
  if (nullable && value === null)
    return
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new ApiContractError(`Invalid ${name}`)
}
function chain(value: unknown) {
  const id = object(value, 'chain').id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    throw new ApiContractError('Invalid chain id')
}
function asset(value: unknown, strict: boolean, prices: boolean, requiredDecimals = strict) {
  const raw = object(value, 'market asset')
  address(raw.address, 'asset address')
  text(raw.symbol, 'asset symbol')
  if (strict)
    text(raw.name, 'asset name')
  else if (raw.name != null && typeof raw.name !== 'string')
    throw new ApiContractError('Invalid asset name')
  if (requiredDecimals || raw.decimals != null) {
    if (typeof raw.decimals !== 'number' || !Number.isInteger(raw.decimals) || raw.decimals < 0 || raw.decimals > 255)
      throw new ApiContractError('Invalid asset decimals')
  }
  const normalized = { ...raw }
  if (!strict && normalized.decimals === null)
    delete normalized.decimals
  if (prices) {
    if (raw.price !== null) {
      const price = object(raw.price, 'asset price')
      number(price.usd, 'asset USD price', true)
      normalized.price = price.usd === null ? null : price
    }
  }
  if (raw.chain != null)
    chain(raw.chain)
  return normalized
}
function references(value: unknown, name: string) {
  if (!Array.isArray(value))
    throw new ApiContractError(`Invalid ${name}`)
  value.forEach(item => address(object(item, name).address, `${name} address`))
}

export function validateSupplyRewards(value: unknown) {
  if (value === null)
    return
  if (!Array.isArray(value))
    throw new ApiContractError('Invalid supply rewards')
  value.forEach((entry) => {
    const reward = object(entry, 'supply reward')
    text(reward.id, 'reward id')
    number(reward.supplyApr, 'reward APR', true)
    asset(reward.asset, false, false)
  })
}

type Kind = 'list' | 'detail' | 'optimizer'
function market(raw: unknown, kind: Kind) {
  const value = object(raw, 'market')
  address(value.marketId, 'market id', 32)
  address(value.uniqueKey, 'market unique key', 32)
  if (value.marketId !== value.uniqueKey)
    throw new ApiContractError('Market aliases disagree')
  address(value.irmAddress, 'IRM address')
  if (value.oracle !== null)
    address(object(value.oracle, 'oracle').address, 'oracle address')
  if (value.loanAsset === null || value.collateralAsset === null || value.oracle === null)
    return null // Explicit upstream unavailability, never an invented address/approval.
  const state = object(value.state, 'market state')
  const normalizedState = { ...state }
  const requiredNumbers = kind === 'optimizer'
    ? ['netSupplyApy', 'supplyApy']
    : [
        'borrowApy',
        'utilization',
        'dailyPriceVariation',
        'netSupplyApy',
        'avgNetSupplyApy',
        'dailyNetSupplyApy',
        'weeklyNetSupplyApy',
        'netBorrowApy',
        'avgNetBorrowApy',
        'dailyNetBorrowApy',
        'weeklyNetBorrowApy',
      ]
  if (kind === 'detail')
    requiredNumbers.push('supplyAssetsUsd', 'borrowAssetsUsd', 'supplyApy', 'avgSupplyApy', 'dailySupplyApy', 'weeklySupplyApy', 'apyAtTarget')
  for (const key of requiredNumbers)
    number(state[key], `state.${key}`)
  if (kind !== 'detail') {
    normalizedState.supplyAssets = quantity(state.supplyAssets, 'supply assets')
    const field = kind === 'optimizer' ? 'supplyShares' : 'borrowAssets'
    normalizedState[field] = quantity(state[field], 'market shares/assets')
    for (const key of kind === 'optimizer' ? ['supplyAssetsUsd'] : ['supplyAssetsUsd', 'borrowAssetsUsd']) {
      number(state[key], `state.${key}`, true)
      if (state[key] === null)
        delete normalizedState[key]
    }
  }
  else {
    if (state.collateralAssets !== null)
      normalizedState.collateralAssets = quantity(state.collateralAssets, 'collateral assets')
    number(state.collateralAssetsUsd, 'collateral USD assets', true)
    normalizedState.rateAtTarget = quantity(state.rateAtTarget, 'rate at target')
    number(object(value.badDebt, 'bad debt').usd, 'bad debt USD')
    number(object(value.realizedBadDebt, 'realized bad debt').usd, 'realized bad debt USD')
  }
  if (kind === 'optimizer') {
    const assetChain = object(object(value.loanAsset, 'loan asset').chain, 'loan asset chain')
    chain(assetChain)
    if (assetChain.network !== null && typeof assetChain.network !== 'string')
      throw new ApiContractError('Invalid loan asset network')
  }
  if (kind !== 'optimizer') {
    quantity(value.lltv, 'LLTV')
    chain(object(value.morphoBlue, 'Morpho instance').chain)
    if (typeof value.listed !== 'boolean')
      throw new ApiContractError('Invalid listed state')
    references(value.supplyingVaults, 'vaults')
    references(value.supplyingVaultV2s, 'vault V2s')
    if (kind === 'list')
      quantity(value.creationTimestamp, 'creation timestamp')
  }
  if (!Array.isArray(value.warnings))
    throw new ApiContractError('Invalid market warnings')
  value.warnings.forEach((entry) => {
    const warning = object(entry, 'warning')
    text(warning.type, 'warning type')
    if (!['YELLOW', 'RED'].includes(String(warning.level)))
      throw new ApiContractError('Invalid warning level')
  })
  if (kind === 'optimizer')
    validateSupplyRewards(state.rewards)
  const normalized: Record<string, unknown> = {
    ...value,
    state: normalizedState,
    loanAsset: asset(value.loanAsset, kind === 'detail', kind === 'detail', true),
    collateralAsset: asset(value.collateralAsset, kind === 'detail', kind === 'detail', true),
  }
  if (kind !== 'optimizer')
    normalized.lltv = quantity(value.lltv, 'LLTV')
  if (kind === 'list')
    normalized.creationTimestamp = quantity(value.creationTimestamp, 'creation timestamp')
  return normalized
}
function rawItems(raw: unknown) {
  const items = object(object(raw, 'markets response').markets, 'markets').items
  if (!Array.isArray(items))
    throw new ApiContractError('Invalid markets items')
  return items
}
export function parseMarketListResponse(raw: unknown): QueryMarketsResult {
  const items = rawItems(raw).map(item => market(item, 'list')).filter(item => item !== null)
  return { markets: { items: normalizeMarketOracles(items as RawMarketOracle<MorphoMarket>[]) } }
}
export function parseOptimizerMarketPage(raw: unknown, expectedChainId?: number): { items: SupplyMarketData[], rawCount: number } {
  const source = rawItems(raw)
  const items = source.map(item => market(item, 'optimizer')).filter(item => item !== null)
  const normalized = normalizeMarketOracles(items as RawMarketOracle<SupplyMarketData>[])
  if (expectedChainId != null && normalized.some(item => item.loanAsset.chain.id !== expectedChainId))
    throw new ApiContractError('Optimizer market chain does not match request')
  return { items: normalized, rawCount: source.length }
}
export function parseMarketDetailResponse(raw: unknown): SingleMorphoMarket | null {
  const payload = object(raw, 'market detail response')
  if (payload.marketById === null)
    return null
  const normalized = market(payload.marketById, 'detail')
  if (!normalized)
    throw new UnavailableMarketMetadataError('Market oracle or asset metadata is currently unavailable')
  return normalizeMarketOracle(normalized as RawMarketOracle<SingleMorphoMarket>)
}
