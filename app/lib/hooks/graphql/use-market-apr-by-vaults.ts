import type { SupplyVaultData, VaultAprResponse } from '../../graphql/vault-aprs'
import { useQuery } from '@tanstack/react-query'
import { trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import { fetchWithDeadline, graphqlRetryDelay, shouldRetryGraphqlRequest } from '../../graphql/request-policy'
import { fetchSupplyVaults } from '../../graphql/vault-aprs'

export type { SupplyVaultData } from '../../graphql/vault-aprs'

const MAINNET_CHAIN_ID = 1
export const BLOCKED_VAULT_ASSET_SYMBOLS = new Set(['APXUSD', 'AUSD', 'FXUSD'])

export interface MarketAprByVaultsConfig {
  minNetApy?: number
  minLiquidityUsd?: number
  blockedAssetSymbols?: ReadonlySet<string>
}

export interface EffectiveVaultApr {
  chainId: number
  effectiveAvgNetApy: number
  effectiveAprInput: string
  source: 'same-chain-vault' | 'mainnet-floor'
  vaultAddress: string
  vaultName: string
  vaultChainId: number
}

function toAprInput(netApy: number): string {
  return trimTrailingZerosDecimalString((netApy * 100).toFixed(2))
}

function normalizeAssetSymbol(symbol?: string | null) {
  return (symbol ?? '').trim().toUpperCase()
}

export function filterEligibleVaults(vaults: SupplyVaultData[], config: MarketAprByVaultsConfig = {}) {
  const minNetApy = config.minNetApy ?? 0.07
  const minLiquidityUsd = config.minLiquidityUsd ?? 50_000
  const blockedAssetSymbols = config.blockedAssetSymbols ?? BLOCKED_VAULT_ASSET_SYMBOLS

  return vaults.filter((vault) => {
    const avgNetApyValue = vault.avgNetApy
    const liquidityUsd = vault.liquidityUsd
    const assetSymbol = normalizeAssetSymbol(vault.asset?.symbol)
    return vault.whitelisted
      && vault.chain?.id != null
      && avgNetApyValue != null
      && Number.isFinite(avgNetApyValue)
      && avgNetApyValue >= minNetApy
      && liquidityUsd != null
      && Number.isFinite(liquidityUsd)
      && liquidityUsd >= minLiquidityUsd
      && !blockedAssetSymbols.has(assetSymbol)
  })
}

export function buildEffectiveVaultAprMap(vaults: SupplyVaultData[], chainIds: number[]) {
  const map = new Map<number, EffectiveVaultApr>()
  const bestByChain = new Map<number, SupplyVaultData>()

  for (const vault of vaults) {
    const chainId = vault.chain.id
    const avgNetApy = vault.avgNetApy
    if (avgNetApy == null)
      continue
    const currentBest = bestByChain.get(chainId)
    if (!currentBest || (currentBest.avgNetApy ?? -1) < avgNetApy)
      bestByChain.set(chainId, vault)
  }

  const mainnetBest = bestByChain.get(MAINNET_CHAIN_ID)
  const mainnetAvgNetApy = mainnetBest?.avgNetApy ?? null

  for (const chainId of chainIds) {
    const localBest = bestByChain.get(chainId)
    const localAvgNetApy = localBest?.avgNetApy ?? null

    let sourceVault = localBest
    let source: EffectiveVaultApr['source'] = 'same-chain-vault'

    if (mainnetBest && mainnetAvgNetApy != null && (localAvgNetApy == null || localAvgNetApy < mainnetAvgNetApy)) {
      sourceVault = mainnetBest
      source = 'mainnet-floor'
    }

    const effectiveAvgNetApy = sourceVault?.avgNetApy
    if (sourceVault == null || effectiveAvgNetApy == null)
      continue

    map.set(chainId, {
      chainId,
      effectiveAvgNetApy,
      effectiveAprInput: toAprInput(effectiveAvgNetApy),
      source,
      vaultAddress: sourceVault.address,
      vaultName: sourceVault.name,
      vaultChainId: sourceVault.chain.id,
    })
  }

  return map
}

export function listPopularVaultAssetSymbols(vaults: SupplyVaultData[]) {
  const counts = new Map<string, number>()
  for (const vault of vaults) {
    const symbol = normalizeAssetSymbol(vault.asset?.symbol)
    if (!symbol)
      continue
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([symbol, count]) => ({ symbol, count }))
}

function deriveVaultAprs(allVaults: SupplyVaultData[], chainIds: number[], config: MarketAprByVaultsConfig) {
  const eligibleVaults = filterEligibleVaults(allVaults, config)
  return { allVaults, eligibleVaults, effectiveByChainId: buildEffectiveVaultAprMap(eligibleVaults, chainIds), popularAssets: listPopularVaultAssetSymbols(eligibleVaults) }
}

export async function fetchMarketAprByVaults(chainIds: number[], config: MarketAprByVaultsConfig = {}, signal?: AbortSignal) {
  return deriveVaultAprs(await fetchSupplyVaults(chainIds, signal), chainIds, config)
}

// Opt-in hook: mounting it owns these requests; it does not preload on unrelated pages.
export function useMarketAprByVaults(chainIds: number[], config: MarketAprByVaultsConfig = {}) {
  const chains = [...new Set(chainIds)].sort((a, b) => a - b)
  const edge = useQuery({
    queryKey: ['edge-cached', 'vault-aprs'],
    queryFn: async ({ signal }) => {
      const response = await fetchWithDeadline('/api/vault-aprs', { signal })
      if (!response.ok)
        throw new Error(`Vault APR edge request failed: ${response.status}`)
      return await response.json() as VaultAprResponse
    },
    enabled: chains.length > 0,
    staleTime: 120_000,
    retry: false,
  })
  return useQuery({
    queryKey: ['vault-aprs', chains],
    queryFn: ({ signal }) => fetchSupplyVaults(chains, signal),
    enabled: chains.length > 0,
    staleTime: 120_000,
    placeholderData: edge.data?.vaults.filter(vault => chains.includes(vault.chain.id)),
    select: vaults => deriveVaultAprs(vaults, chains, config),
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
  })
}
