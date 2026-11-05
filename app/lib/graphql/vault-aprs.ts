import { graphqlClient } from './client'
import { ApiContractError } from './market-responses'
import { OrderDirection, QUERY_VAULTS_V1, QUERY_VAULTS_V2, VaultOrderBy, VaultV2OrderBy } from './queries/vaults-by-asset'

export interface SupplyVaultData {
  address: string
  name: string
  symbol: string
  whitelisted: boolean
  chain: { id: number }
  asset: { address: string, symbol: string, decimals: number }
  avgNetApy: number | null
  liquidityUsd: number | null
  version: 'v1' | 'v2'
}
export interface VaultAprResponse { vaults: SupplyVaultData[] }

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new ApiContractError('Invalid vault APR object')
  return raw as Record<string, unknown>
}
function address(raw: unknown): string {
  if (typeof raw !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(raw))
    throw new ApiContractError('Invalid vault APR address')
  return raw.toLowerCase()
}
function text(raw: unknown): string {
  if (typeof raw !== 'string')
    throw new ApiContractError('Invalid vault APR metadata')
  return raw
}
function metric(raw: unknown): number | null {
  if (raw === null)
    return null
  if (typeof raw !== 'number' || !Number.isFinite(raw))
    throw new ApiContractError('Invalid vault APR metric')
  return raw
}
export function parseVaultAprPage(raw: unknown, version: 'v1' | 'v2', chains: number[]): SupplyVaultData[] {
  const items = object(object(raw)[version === 'v1' ? 'vaults' : 'vaultV2s']).items
  if (!Array.isArray(items))
    throw new ApiContractError('Invalid vault APR items')
  return items.map((entry) => {
    const vault = object(entry)
    const id = object(vault.chain).id
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || !chains.includes(id))
      throw new ApiContractError('Invalid vault APR chain')
    if (typeof vault.whitelisted !== 'boolean')
      throw new ApiContractError('Invalid vault APR listing flag')
    const asset = object(vault.asset)
    if (typeof asset.decimals !== 'number' || !Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255)
      throw new ApiContractError('Invalid vault APR asset decimals')
    const state = version === 'v1' && vault.state !== null ? object(vault.state) : null
    const liquidity = version === 'v1' && vault.liquidity !== null ? object(vault.liquidity) : null
    return {
      address: address(vault.address),
      name: text(vault.name),
      symbol: text(vault.symbol),
      whitelisted: vault.whitelisted,
      chain: { id },
      asset: { address: address(asset.address), symbol: text(asset.symbol), decimals: asset.decimals },
      avgNetApy: metric(version === 'v1' ? state === null ? null : state.avgNetApy : vault.avgNetApy),
      liquidityUsd: version === 'v1'
        ? (liquidity === null ? null : metric(liquidity.usd)) ?? (state === null ? null : metric(state.totalAssetsUsd))
        : metric(vault.liquidityUsd) ?? metric(vault.totalAssetsUsd),
      version,
    }
  })
}

export async function fetchSupplyVaults(chainIds: number[], signal?: AbortSignal): Promise<SupplyVaultData[]> {
  if (!chainIds.length || chainIds.some(id => !Number.isSafeInteger(id) || id <= 0))
    throw new ApiContractError('Invalid vault APR chain selection')
  const versions = await Promise.all((['v1', 'v2'] as const).map(async (version) => {
    const vaults: SupplyVaultData[] = []
    const seen = new Set<string>()
    for (let skip = 0; ; skip += 200) {
      signal?.throwIfAborted()
      const raw = await graphqlClient.request<unknown>({
        document: version === 'v1' ? QUERY_VAULTS_V1 : QUERY_VAULTS_V2,
        variables: { first: 200, skip, where: { chainId_in: chainIds, listed: true }, orderBy: version === 'v1' ? VaultOrderBy.AvgNetApy : VaultV2OrderBy.Address, orderDirection: OrderDirection.Desc },
        signal,
      })
      const page = parseVaultAprPage(raw, version, chainIds)
      for (const vault of page) {
        const key = `${vault.chain.id}:${vault.address}`
        if (seen.has(key))
          throw new ApiContractError('Repeated vault APR page identity')
        seen.add(key)
        vaults.push(vault)
      }
      if (page.length < 200)
        return vaults
    }
  }))
  return versions.flat()
}
