import type { CrossChainUserPosition } from './use-user-positions'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'
import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { supportedChainMap } from '~/lib/addresses'
import { graphqlClient } from '../../graphql/client'

interface QueryUserVaultV2PositionsResult {
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

interface QueryCrossChainVaultV2PositionsResult {
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

const QUERY_USER_VAULT_V2_POSITIONS = gql`
  query GetUserVaultV2Positions($user: String!, $chainId: Int!) {
    userByAddress(address: $user, chainId: $chainId) {
      vaultV2Positions {
        shares
        assets
        assetsUsd
        vault {
          address
          name
          symbol
          netApy
          asset {
            address
            symbol
            decimals
            price {
              usd
            }
          }
        }
      }
    }
  }
`

const QUERY_USER_VAULT_V2_CHAINS = gql`
  query GetUserVaultV2Chains($user: String!, $chainId: Int!) {
    userByAddress(address: $user, chainId: $chainId) {
      vaultV2Positions {
        shares
        assets
        vault {
          address
        }
      }
    }
  }
`

function toBigint(value: string | number | bigint | undefined | null): bigint {
  return BigInt(value || '0')
}

function vaultPositionToLivePosition(position: NonNullable<QueryUserVaultV2PositionsResult['userByAddress']>['vaultV2Positions'][number]): LiveMarketPosition | null {
  const shares = toBigint(position.shares)
  const assets = toBigint(position.assets)
  if (shares <= 0n || assets <= 0n)
    return null

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
        netSupplyApy: position.vault.netApy ?? 0,
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

export async function fetchUserVaultV2Positions(userAddress: string, chainId: number) {
  const result = await graphqlClient.request<QueryUserVaultV2PositionsResult>(
    QUERY_USER_VAULT_V2_POSITIONS,
    {
      user: userAddress,
      chainId,
    },
  )

  return (result.userByAddress?.vaultV2Positions ?? [])
    .map(vaultPositionToLivePosition)
    .filter((position): position is LiveMarketPosition => position !== null)
}

export function useLiveVaultV2Positions(userAddress?: string, chainId?: number, refreshKey?: number) {
  return useQuery<LiveMarketPosition[]>({
    queryKey: ['user-vault-v2-positions-graph', userAddress, chainId, refreshKey ?? 0],
    queryFn: async () => {
      if (!userAddress || !chainId)
        return []

      return fetchUserVaultV2Positions(userAddress, chainId)
    },
    enabled: !!userAddress && !!chainId,
    staleTime: 30 * 1000,
  })
}

export function useUserVaultV2PositionChains(userAddress?: string) {
  return useQuery<CrossChainUserPosition[]>({
    queryKey: ['user-vault-v2-position-chains', userAddress],
    queryFn: async () => {
      if (!userAddress)
        return []

      const results = await Promise.allSettled([...supportedChainMap.keys()].map(async (chainId) => {
        const result = await graphqlClient.request<QueryCrossChainVaultV2PositionsResult>(
          QUERY_USER_VAULT_V2_CHAINS,
          {
            user: userAddress,
            chainId,
          },
        )

        return (result.userByAddress?.vaultV2Positions ?? [])
          .filter(position => toBigint(position.shares) > 0n && toBigint(position.assets) > 0n)
          .map(position => ({
            chainId,
            uniqueKey: `vault-v2:${position.vault.address.toLowerCase()}`,
            supplyShares: position.shares,
            marketSupplyAssets: position.assets,
            marketSupplyShares: position.shares,
          }))
      }))

      return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    },
    enabled: !!userAddress,
    staleTime: 30 * 1000,
  })
}
