import type { CrossChainUserPosition } from './use-user-positions'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { useQuery } from '@tanstack/react-query'
import { supportedChainMap } from '~/lib/addresses'
import { UnavailableMarketMetadataError } from '~/lib/graphql/market-responses'
import { QUERY_USER_VAULT_V2_CHAINS, QUERY_USER_VAULT_V2_POSITIONS } from '~/lib/graphql/queries/vault-v2-positions'
import { graphqlRetryDelay, shouldRetryGraphqlRequest } from '~/lib/graphql/request-policy'
import { parseVaultV2ChainPositionsResponse, parseVaultV2PositionsResponse } from '~/lib/graphql/vault-position-responses'
import { graphqlClient } from '../../graphql/client'

export interface QueryUserVaultV2PositionsResult {
  userByAddress: {
    vaultV2Positions: Array<{
      shares: string
      assets: string
      assetsUsd: number | null
      vault: {
        address: string
        name: string
        symbol: string
        netApy: number | null
        asset: {
          address: string
          symbol: string
          decimals: number
          price?: {
            usd?: number | null
          } | null
        }
      }
    }>
  } | null
}

export interface QueryCrossChainVaultV2PositionsResult {
  userByAddress: {
    vaultV2Positions: Array<{
      shares: string
      assets: string
      vault: {
        address: string
      }
    }>
  } | null
}

function toBigint(value: string | number | bigint | undefined | null): bigint {
  return BigInt(value || '0')
}

function vaultPositionToLivePosition(position: NonNullable<QueryUserVaultV2PositionsResult['userByAddress']>['vaultV2Positions'][number]): LiveMarketPosition | null {
  const shares = toBigint(position.shares)
  const assets = toBigint(position.assets)
  if (shares <= 0n || assets <= 0n)
    return null

  if (position.vault.netApy === null)
    throw new UnavailableMarketMetadataError('Vault APR is currently unavailable; totals cannot be presented as complete')

  const vaultKey = `vault-v2:${position.vault.address.toLowerCase()}`
  return {
    market: {
      uniqueKey: vaultKey,
      irmAddress: '',
      oracleAddress: undefined,
      lltv: undefined,
      warnings: undefined,
      loanAsset: {
        symbol: position.vault.asset.symbol,
        decimals: position.vault.asset.decimals,
        address: position.vault.asset.address,
        price: position.vault.asset.price,
      },
      collateralAsset: {
        symbol: position.vault.symbol,
        decimals: 18,
        address: position.vault.address,
      },
      state: {
        netSupplyApy: position.vault.netApy,
        utilization: 0,
        supplyAssets: position.assets,
        supplyShares: position.shares,
        supplyAssetsUsd: position.assetsUsd,
        rewards: null,
      },
    },
    userState: {
      supplyShares: shares,
      borrowShares: 0n,
      collateral: 0n,
    },
    liveState: {
      suppliedAssets: assets,
      projectedSuppliedAssets: assets,
    },
    source: {
      kind: 'vaultV2',
      vaultAddress: position.vault.address,
      vaultName: position.vault.name,
      vaultSymbol: position.vault.symbol,
    },
  }
}

export async function fetchUserVaultV2Positions(userAddress: string, chainId: number, signal?: AbortSignal) {
  const result = await graphqlClient.request<unknown>({ document: QUERY_USER_VAULT_V2_POSITIONS, variables: {
    user: userAddress,
    chainId,
  }, signal })

  return parseVaultV2PositionsResponse(result)
    .map(vaultPositionToLivePosition)
    .filter((position): position is LiveMarketPosition => position !== null)
}

export function useLiveVaultV2Positions(userAddress?: string, chainId?: number, refreshKey?: number) {
  return useQuery<LiveMarketPosition[]>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['user-vault-v2-positions-graph', userAddress, chainId, refreshKey ?? 0],
    queryFn: async ({ signal }) => {
      if (!userAddress || !chainId)
        return []

      return fetchUserVaultV2Positions(userAddress, chainId, signal)
    },
    enabled: !!userAddress && !!chainId,
    staleTime: 30 * 1000,
  })
}

export function useUserVaultV2PositionChains(userAddress?: string) {
  return useQuery<CrossChainUserPosition[]>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['user-vault-v2-position-chains', userAddress],
    queryFn: async ({ signal }) => {
      if (!userAddress)
        return []

      const results = await Promise.allSettled([...supportedChainMap.keys()].map(async (chainId) => {
        const result = await graphqlClient.request<unknown>({ document: QUERY_USER_VAULT_V2_CHAINS, variables: {
          user: userAddress,
          chainId,
        }, signal })

        return parseVaultV2ChainPositionsResponse(result)
          .filter(position => toBigint(position.shares) > 0n && toBigint(position.assets) > 0n)
          .map(position => ({
            chainId,
            uniqueKey: `vault-v2:${position.vault.address.toLowerCase()}`,
            supplyShares: position.shares,
            marketSupplyAssets: position.assets,
            marketSupplyShares: position.shares,
          }))
      }))

      const failures = results.filter(result => result.status === 'rejected')
      if (failures.length > 0)
        throw new Error(`Vault position discovery failed on ${failures.length} chain(s); results are incomplete`)
      return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    },
    enabled: !!userAddress,
    staleTime: 30 * 1000,
  })
}
