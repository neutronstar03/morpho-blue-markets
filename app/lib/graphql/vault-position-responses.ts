import type { QueryCrossChainVaultV2PositionsResult, QueryUserVaultV2PositionsResult } from '../hooks/graphql/use-vault-v2-adapter-positions'
import { ApiContractError, normalizeUnsignedInteger } from './market-responses'

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ApiContractError('Invalid vault position object')
  return raw as Record<string, unknown>
}
function address(value: unknown) {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value))
    throw new ApiContractError('Invalid vault position address')
}
function numeric(value: unknown, nullable = false) {
  if (nullable && value === null)
    return
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new ApiContractError('Invalid vault position numeric value')
}
function parse(raw: unknown, full: boolean) {
  const response = object(raw)
  if (response.userByAddress === null)
    return []
  const positions = object(response.userByAddress).vaultV2Positions
  if (!Array.isArray(positions))
    throw new ApiContractError('Invalid vault positions array')
  return positions.map((entry) => {
    const item = { ...object(entry) }
    for (const key of ['shares', 'assets'])
      item[key] = normalizeUnsignedInteger(item[key], `vault position ${key}`)
    const vault = { ...object(item.vault) }
    item.vault = vault
    address(vault.address)
    if (!full)
      return item
    numeric(item.assetsUsd, true)
    numeric(vault.netApy, true)
    if (typeof vault.name !== 'string' || typeof vault.symbol !== 'string')
      throw new ApiContractError('Invalid vault identity')
    const asset = { ...object(vault.asset) }
    vault.asset = asset
    address(asset.address)
    if (typeof asset.symbol !== 'string' || typeof asset.decimals !== 'number'
      || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) {
      throw new ApiContractError('Invalid vault asset metadata')
    }
    if (asset.price !== null) {
      const price = object(asset.price)
      numeric(price.usd, true)
      if (price.usd === null)
        asset.price = null // Intentional unavailable price, never an invented USD zero.
    }
    return item
  })
}
export function parseVaultV2PositionsResponse(raw: unknown): NonNullable<QueryUserVaultV2PositionsResult['userByAddress']>['vaultV2Positions'] {
  return parse(raw, true) as NonNullable<QueryUserVaultV2PositionsResult['userByAddress']>['vaultV2Positions']
}
export function parseVaultV2ChainPositionsResponse(raw: unknown): NonNullable<QueryCrossChainVaultV2PositionsResult['userByAddress']>['vaultV2Positions'] {
  return parse(raw, false) as NonNullable<QueryCrossChainVaultV2PositionsResult['userByAddress']>['vaultV2Positions']
}
