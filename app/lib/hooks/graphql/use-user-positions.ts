import { useQuery } from '@tanstack/react-query'
import { supportedChainMap } from '~/lib/addresses'
import { collectPositionPages, validatePositionIdentity } from '~/lib/graphql/position-pages'
import { QUERY_USER_POSITIONS, QUERY_USER_POSITIONS_ALL_CHAINS } from '~/lib/graphql/queries/user-positions'
import { graphqlRetryDelay, shouldRetryGraphqlRequest } from '~/lib/graphql/request-policy'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { graphqlClient } from '../../graphql/client'

// Data returned from the GraphQL query for each position
export interface UserPosition {
  market: {
    marketId: string
    uniqueKey: string
    loanAsset: {
      symbol: string
      decimals: number
      address: string
      price?: {
        usd?: number | null
      } | null
    }
    collateralAsset: {
      symbol: string
      decimals: number
      address: string
    }
    oracle: {
      address: string
    } | null
    irmAddress: string
    lltv: string
    warnings?: Array<{
      type: string
      level: 'YELLOW' | 'RED'
    }>
    state: {
      netSupplyApy: number
      utilization: number
      supplyAssets: string
      supplyShares: string
      supplyAssetsUsd: number | null
      rewards?: Array<{
        supplyApr?: number | null
        id: string
        asset: {
          address: string
          symbol: string
          decimals?: number | null
        }
      }> | null
    }
  }
  state: {
    supplyShares: string
    borrowShares: string
    collateral: string
  }
  source?: {
    kind: 'direct' | 'vaultV2'
    ownerAddress?: string
    vaultAddress?: string
    vaultName?: string
    vaultSymbol?: string
    multiplierNumerator?: string
    multiplierDenominator?: string
  }
}

export interface CrossChainUserPosition {
  chainId: number
  uniqueKey: string
  supplyShares: string
  marketSupplyAssets: string
  marketSupplyShares: string
  warnings?: Array<{
    type: string
    level: 'YELLOW' | 'RED'
  }>
}

interface QueryCrossChainUserPositionsResult {
  marketPositions: {
    items: Array<{
      market: {
        marketId: string
        uniqueKey: string
        state: {
          supplyAssets: string
          supplyShares: string
        }
        warnings?: Array<{
          type: string
          level: 'YELLOW' | 'RED'
        }>
        morphoBlue: {
          chain: {
            id: number
          }
        }
      }
      state: {
        supplyShares: string
      }
    }>
  }
}

function isVisibleUserPosition(position: UserPosition) {
  return hasVisibleSuppliedAssets({
    userSupplyShares: position.state.supplyShares,
    totalSupplyAssets: position.market.state.supplyAssets,
    totalSupplyShares: position.market.state.supplyShares,
  }) && !isOracleMisconfiguredWarning(position.market.warnings)
}

export async function fetchUserPositions(userAddress: string, chainId: number, options: { signal?: AbortSignal, pageSize?: number } = {}) {
  const positions = await collectPositionPages<UserPosition>({
    pageSize: options.pageSize ?? 100,
    signal: options.signal,
    fetchPage: (first, skip) => graphqlClient.request({
      document: QUERY_USER_POSITIONS,
      variables: { user: userAddress, chainId, first, skip },
      signal: options.signal,
    }),
    parseItem: (raw) => {
      return validatePositionIdentity(raw, false) as unknown as UserPosition
    },
    key: position => `${chainId}:${position.market.uniqueKey.toLowerCase()}`,
  })
  return positions
    .map(position => ({ ...position, source: { kind: 'direct' as const } }))
    .filter(isVisibleUserPosition)
}

export function useUserPositions(userAddress?: string, chainId?: number) {
  return useQuery<UserPosition[]>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['user-positions-graph', userAddress, chainId],
    queryFn: async ({ signal }) => {
      if (!userAddress || !chainId)
        return []

      return fetchUserPositions(userAddress, chainId, { signal })
    },
    enabled: !!userAddress && !!chainId,
    staleTime: 30 * 1000, // 30 seconds - positions don't change that often
  })
}

export function useUserPositionsAcrossChains(userAddress?: string) {
  return useQuery<CrossChainUserPosition[]>({
    retry: shouldRetryGraphqlRequest,
    retryDelay: graphqlRetryDelay,
    queryKey: ['user-positions-graph-all-chains', userAddress],
    queryFn: async ({ signal }) => {
      if (!userAddress)
        return []

      // Discovery-only query used for cross-chain pills.
      // Keep it lean: we only need chain + market identity, not full live position data.
      const positions = await collectPositionPages<QueryCrossChainUserPositionsResult['marketPositions']['items'][number]>({
        pageSize: 500,
        signal,
        fetchPage: (first, skip) => graphqlClient.request({
          document: QUERY_USER_POSITIONS_ALL_CHAINS,
          variables: { user: userAddress, chainIds: [...supportedChainMap.keys()], first, skip },
          signal,
        }),
        parseItem: (raw) => {
          return validatePositionIdentity(raw, true) as unknown as QueryCrossChainUserPositionsResult['marketPositions']['items'][number]
        },
        key: position => `${position.market.morphoBlue.chain.id}:${position.market.uniqueKey.toLowerCase()}`,
      })

      return positions
        .filter(position => hasVisibleSuppliedAssets({
          userSupplyShares: position.state.supplyShares,
          totalSupplyAssets: position.market.state.supplyAssets,
          totalSupplyShares: position.market.state.supplyShares,
        }) && !isOracleMisconfiguredWarning(position.market.warnings))
        .map(position => ({
          chainId: position.market.morphoBlue.chain.id,
          uniqueKey: position.market.uniqueKey,
          supplyShares: position.state.supplyShares,
          marketSupplyAssets: position.market.state.supplyAssets,
          marketSupplyShares: position.market.state.supplyShares,
          warnings: position.market.warnings,
        }))
    },
    enabled: !!userAddress,
    staleTime: 30 * 1000,
  })
}
