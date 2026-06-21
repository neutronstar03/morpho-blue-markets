import type { CrossChainUserPosition, UserPosition } from './use-user-positions'
import { useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { supportedChainMap } from '~/lib/addresses'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { graphqlClient } from '../../graphql/client'

interface QueryUserVaultV2AdapterPositionsResult {
  userByAddress: {
    vaultV2Positions: Array<{
      shares: string
      vault: {
        address: string
        name: string
        symbol: string
        totalSupply: string
        adapters: {
          items: Array<{
            __typename: string
            address: string
            positions?: {
              items: UserPosition[]
            }
          }>
        }
      }
    }>
  } | null
}

interface QueryCrossChainVaultV2PositionsResult {
  userByAddress: {
    vaultV2Positions: Array<{
      shares: string
      vault: {
        address: string
      }
    }>
  } | null
}

const QUERY_USER_VAULT_V2_ADAPTER_POSITIONS = gql`
  query GetUserVaultV2AdapterPositions($user: String!, $chainId: Int!) {
    userByAddress(address: $user, chainId: $chainId) {
      vaultV2Positions {
        shares
        vault {
          address
          name
          symbol
          totalSupply
          adapters(first: 20) {
            items {
              __typename
              address
              ... on MorphoMarketV1Adapter {
                positions(first: 20) {
                  items {
                    market {
                      marketId
                      uniqueKey: marketId
                      loanAsset {
                        symbol
                        decimals
                        address
                        price {
                          usd
                        }
                      }
                      collateralAsset {
                        symbol
                        decimals
                        address
                      }
                      oracle {
                        address
                      }
                      irmAddress
                      lltv
                      warnings { type level }
                      state {
                        netSupplyApy
                        utilization
                        supplyAssets
                        supplyShares
                        supplyAssetsUsd
                      }
                    }
                    state {
                      supplyShares
                      borrowShares
                      collateral
                    }
                  }
                }
              }
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
        vault {
          address
        }
      }
    }
  }
`

function toBigint(value: string | undefined): bigint {
  return BigInt(value || '0')
}

function mulDivDown(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (value <= 0n || numerator <= 0n || denominator <= 0n)
    return 0n
  return (value * numerator) / denominator
}

function scalePositionState(state: UserPosition['state'], numerator: bigint, denominator: bigint): UserPosition['state'] {
  return {
    supplyShares: mulDivDown(toBigint(state.supplyShares), numerator, denominator).toString(),
    borrowShares: mulDivDown(toBigint(state.borrowShares), numerator, denominator).toString(),
    collateral: mulDivDown(toBigint(state.collateral), numerator, denominator).toString(),
  }
}

function isVisibleUserPosition(position: UserPosition) {
  return hasVisibleSuppliedAssets({
    userSupplyShares: position.state.supplyShares,
    totalSupplyAssets: position.market.state.supplyAssets,
    totalSupplyShares: position.market.state.supplyShares,
  }) && !isOracleMisconfiguredWarning(position.market.warnings)
}

export async function fetchUserVaultV2AdapterPositions(userAddress: string, chainId: number) {
  const result = await graphqlClient.request<QueryUserVaultV2AdapterPositionsResult>(
    QUERY_USER_VAULT_V2_ADAPTER_POSITIONS,
    {
      user: userAddress,
      chainId,
    },
  )

  const out: UserPosition[] = []
  for (const vaultPosition of result.userByAddress?.vaultV2Positions ?? []) {
    const userVaultShares = toBigint(vaultPosition.shares)
    const vaultTotalSupply = toBigint(vaultPosition.vault.totalSupply)
    if (userVaultShares <= 0n || vaultTotalSupply <= 0n)
      continue

    for (const adapter of vaultPosition.vault.adapters.items ?? []) {
      if (adapter.__typename !== 'MorphoMarketV1Adapter' || !adapter.positions)
        continue

      for (const position of adapter.positions.items ?? []) {
        const scaledPosition: UserPosition = {
          ...position,
          state: scalePositionState(position.state, userVaultShares, vaultTotalSupply),
          source: {
            kind: 'vaultV2Adapter',
            ownerAddress: adapter.address,
            vaultAddress: vaultPosition.vault.address,
            vaultName: vaultPosition.vault.name,
            vaultSymbol: vaultPosition.vault.symbol,
            multiplierNumerator: userVaultShares.toString(),
            multiplierDenominator: vaultTotalSupply.toString(),
          },
        }
        if (isVisibleUserPosition(scaledPosition))
          out.push(scaledPosition)
      }
    }
  }

  return out
}

export function useUserVaultV2AdapterPositions(userAddress?: string, chainId?: number) {
  return useQuery<UserPosition[]>({
    queryKey: ['user-vault-v2-adapter-positions-graph', userAddress, chainId],
    queryFn: async () => {
      if (!userAddress || !chainId)
        return []

      return fetchUserVaultV2AdapterPositions(userAddress, chainId)
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
          .filter(position => toBigint(position.shares) > 0n)
          .map(position => ({
            chainId,
            uniqueKey: `vault-v2:${position.vault.address}`,
            supplyShares: position.shares,
            marketSupplyAssets: '1',
            marketSupplyShares: '1',
          }))
      }))

      return results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    },
    enabled: !!userAddress,
    staleTime: 30 * 1000,
  })
}
