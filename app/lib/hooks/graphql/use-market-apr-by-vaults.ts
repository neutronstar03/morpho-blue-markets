import type { QueryVaultsV1Result, QueryVaultsV2Result, SupplyVaultV1Data, SupplyVaultV2Data } from '~/lib/graphql/queries/vaults-by-asset'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supportedChainMap } from '~/lib/addresses'
import { OrderDirection, QUERY_VAULTS_V1, QUERY_VAULTS_V2, VaultOrderBy, VaultV2OrderBy } from '~/lib/graphql/queries/vaults-by-asset'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'
import { trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import { graphqlClient } from '../../graphql/client'

const MAINNET_CHAIN_ID = 1
export const BLOCKED_VAULT_ASSET_SYMBOLS = new Set(['APXUSD', 'AUSD', 'FXUSD'])

interface VaultV1Filters {
  chainId_in?: number[]
  totalAssetsUsd_gte?: number
  whitelisted?: boolean
}

interface VaultV2Filters {
  chainId_in?: number[]
  totalAssetsUsd_gte?: number
  whitelisted?: boolean
}

export interface SupplyVaultData {
  address: string
  name: string
  symbol: string
  whitelisted: boolean
  chain: {
    id: number
  }
  asset: {
    address: string
    symbol: string
    decimals: number
  }
  avgNetApy?: number | null
  liquidityUsd?: number | null
  version: 'v1' | 'v2'
}

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

export interface UseVaultAprMapOptions {
  minNetApy?: number
  minLiquidityUsd?: number
  enabled?: boolean
}

function toAprInput(netApy: number): string {
  return trimTrailingZerosDecimalString((netApy * 100).toFixed(2))
}

function normalizeAssetSymbol(symbol?: string | null) {
  return (symbol ?? '').trim().toUpperCase()
}

function normalizeVaultV1(vault: SupplyVaultV1Data): SupplyVaultData {
  return {
    address: vault.address,
    name: vault.name,
    symbol: vault.symbol,
    whitelisted: vault.whitelisted,
    chain: vault.chain,
    asset: vault.asset,
    avgNetApy: vault.state?.avgNetApy,
    liquidityUsd: vault.liquidity?.usd ?? vault.state?.totalAssetsUsd,
    version: 'v1',
  }
}

function normalizeVaultV2(vault: SupplyVaultV2Data): SupplyVaultData {
  return {
    address: vault.address,
    name: vault.name,
    symbol: vault.symbol,
    whitelisted: vault.whitelisted,
    chain: vault.chain,
    asset: vault.asset,
    avgNetApy: vault.avgNetApy,
    liquidityUsd: vault.liquidityUsd ?? vault.totalAssetsUsd,
    version: 'v2',
  }
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

export async function fetchMarketAprByVaults(chainIds: number[], config: MarketAprByVaultsConfig = {}) {
  const minLiquidityUsd = config.minLiquidityUsd ?? 50_000

  const whereV1: VaultV1Filters = {
    chainId_in: chainIds,
    totalAssetsUsd_gte: minLiquidityUsd,
    whitelisted: true,
  }
  const whereV2: VaultV2Filters = {
    chainId_in: chainIds,
    totalAssetsUsd_gte: minLiquidityUsd,
    whitelisted: true,
  }

  const [v1Result, v2Result] = await Promise.all([
    graphqlClient.request<QueryVaultsV1Result>(QUERY_VAULTS_V1, {
      where: whereV1,
      orderBy: VaultOrderBy.AvgNetApy,
      orderDirection: OrderDirection.Desc,
      first: 200,
      skip: 0,
    }),
    graphqlClient.request<QueryVaultsV2Result>(QUERY_VAULTS_V2, {
      where: whereV2,
      orderBy: VaultV2OrderBy.Address,
      orderDirection: OrderDirection.Desc,
      first: 200,
      skip: 0,
    }),
  ])

  const allVaults = [
    ...(v1Result.vaults.items ?? []).map(normalizeVaultV1),
    ...(v2Result.vaultV2s.items ?? []).map(normalizeVaultV2),
  ]
  const eligibleVaults = filterEligibleVaults(allVaults, config)

  return {
    allVaults,
    eligibleVaults,
    effectiveByChainId: buildEffectiveVaultAprMap(eligibleVaults, chainIds),
    popularAssets: listPopularVaultAssetSymbols(eligibleVaults),
  }
}

export function useMarketAprByVaults(opts: UseVaultAprMapOptions = {}) {
  const minNetApy = opts.minNetApy ?? 0.07
  const minLiquidityUsd = opts.minLiquidityUsd ?? 50_000
  const enabled = opts.enabled ?? true
  const chainIds = useMemo(() => [...supportedChainMap.keys()], [])

  // Edge-cached placeholder: fetches pre-processed vault data from our edge cache
  // for instant first paint while the live GraphQL query runs in background.
  const edgeQuery = useQuery<SupplyVaultData[]>({
    queryKey: ['edge-cached', 'vault-aprs', minNetApy, minLiquidityUsd],
    queryFn: async () => {
      const params = new URLSearchParams({
        minLiquidityUsd: String(minLiquidityUsd),
      })
      const res = await fetch(`/api/vault-aprs?${params}`)
      if (!res.ok)
        throw new Error(`Edge cache error: ${res.status}`)
      const raw = await res.json() as {
        v1: { data: QueryVaultsV1Result }
        v2: { data: QueryVaultsV2Result }
      }
      const allVaults = [
        ...(raw.v1?.data?.vaults?.items ?? []).map(normalizeVaultV1),
        ...(raw.v2?.data?.vaultV2s?.items ?? []).map(normalizeVaultV2),
      ]
      return filterEligibleVaults(allVaults, { minNetApy, minLiquidityUsd })
    },
    enabled,
    staleTime: STALE_TIME_MEDIUM_MS,
    refetchOnWindowFocus: false,
  })

  const query = useQuery<SupplyVaultData[]>({
    queryKey: ['vault-apr-map', minNetApy, minLiquidityUsd],
    queryFn: async () => {
      const result = await fetchMarketAprByVaults(chainIds, { minNetApy, minLiquidityUsd })
      return result.eligibleVaults
    },
    enabled,
    placeholderData: edgeQuery.data,
    staleTime: STALE_TIME_MEDIUM_MS,
    refetchOnWindowFocus: false,
  })

  const effectiveByChainId = useMemo(() => {
    return buildEffectiveVaultAprMap(query.data ?? [], chainIds)
  }, [chainIds, query.data])

  return {
    ...query,
    vaults: query.data ?? [],
    effectiveByChainId,
  }
}
