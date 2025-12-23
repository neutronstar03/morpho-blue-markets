import type { SupportedChain } from '../../addresses'

import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { getSupportedChainName, morphoAddressOnChain } from '../../addresses'
import { useUserPositions } from '../graphql/use-user-positions'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from './simplified.abi'

// This interface maps the GraphQL position data to what position.tsx expects
export interface LiveMarketPosition {
  market: {
    uniqueKey: string
    loanAsset: {
      symbol: string
      decimals: number | null
      address: string
    }
    collateralAsset: {
      symbol: string
      decimals: number | null
      address: string
    }
    state: {
      netSupplyApy: number
      supplyAssets: string
      supplyShares: string
      supplyAssetsUsd?: number | null
    }
  }
  userState: {
    supplyShares: bigint
    borrowShares: bigint
    collateral: bigint
  }
}

interface PositionCall {
  address: `0x${string}`
  abi: typeof SIMPLIFIED_MORPHO_BLUE_ABI
  functionName: 'position'
  args: readonly [`0x${string}`, `0x${string}`]
}

/**
 * Efficient Live Market Positions Hook
 *
 * Strategy:
 * 1. Discovery: Use GraphQL to find only markets where user has a position (efficient!)
 * 2. Live Data: Use RPC to fetch real-time position data for those markets
 *
 * This avoids iterating over all ~1000 markets on a chain.
 */
export function useLiveMarketPositions() {
  const { address: userAddress, chain } = useAccount()

  // Step 1: Efficient discovery via GraphQL
  // This returns only markets where user has a position, filtered by chainId
  const {
    data: graphPositions,
    isLoading: isLoadingGraph,
    refetch: refetchGraph,
    dataUpdatedAt: graphUpdatedAt,
  } = useUserPositions(userAddress, chain?.id)

  const morphoAddress = useMemo(() => {
    if (!chain)
      return undefined
    const chainName = getSupportedChainName(chain.id)
    if (chainName.startsWith('Chain '))
      return undefined
    return morphoAddressOnChain[chainName as SupportedChain]
  }, [chain])

  // Step 2: Build RPC calls only for discovered positions
  const multicallContracts = useMemo<PositionCall[]>(() => {
    if (!graphPositions || !userAddress || !morphoAddress)
      return []

    return graphPositions.map<PositionCall>(position => ({
      address: morphoAddress as `0x${string}`,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'position',
      args: [position.market.uniqueKey as `0x${string}`, userAddress as `0x${string}`] as const,
    }))
  }, [graphPositions, userAddress, morphoAddress])

  // Step 3: Fetch live position data from RPC
  const {
    data: positionResults,
    isLoading: isLoadingPositions,
    refetch: refetchPositions,
    dataUpdatedAt: rpcUpdatedAt,
  } = useReadContracts({
    contracts: multicallContracts,
    allowFailure: true,
    query: {
      enabled: !!graphPositions && graphPositions.length > 0 && !!userAddress && !!morphoAddress,
    },
  })

  // Step 4: Merge GraphQL market data with live RPC position data
  const userPositions = useMemo<LiveMarketPosition[]>(() => {
    if (!graphPositions)
      return []

    // If RPC data is not ready yet, use GraphQL data for display
    // This gives us immediate feedback while RPC is loading
    if (!positionResults || positionResults.length !== graphPositions.length) {
      return graphPositions.map((gp): LiveMarketPosition => ({
        market: {
          uniqueKey: gp.market.uniqueKey,
          loanAsset: gp.market.loanAsset,
          collateralAsset: gp.market.collateralAsset,
          state: {
            netSupplyApy: gp.market.state.netSupplyApy ?? 0,
            supplyAssets: gp.market.state.supplyAssets,
            supplyShares: gp.market.state.supplyShares,
            supplyAssetsUsd: gp.market.state.supplyAssetsUsd,
          },
        },
        userState: {
          supplyShares: BigInt(gp.state.supplyShares || '0'),
          borrowShares: BigInt(gp.state.borrowShares || '0'),
          collateral: BigInt(gp.state.collateral || '0'),
        },
      }))
    }

    // Merge with live RPC data
    return graphPositions
      .map((gp, index): LiveMarketPosition | null => {
        const result = positionResults[index]

        // Use live RPC data if available, otherwise fall back to GraphQL
        let supplyShares: bigint
        let borrowShares: bigint
        let collateral: bigint

        if (result.status === 'success' && result.result) {
          const [ss, bs, col] = result.result as readonly [bigint, bigint, bigint]
          supplyShares = ss
          borrowShares = bs
          collateral = col
        }
        else {
          // Fallback to GraphQL data
          supplyShares = BigInt(gp.state.supplyShares || '0')
          borrowShares = BigInt(gp.state.borrowShares || '0')
          collateral = BigInt(gp.state.collateral || '0')
        }

        // Filter out zero positions (user may have exited since GraphQL indexed)
        const hasPosition = supplyShares > 0n || borrowShares > 0n || collateral > 0n
        if (!hasPosition)
          return null

        return {
          market: {
            uniqueKey: gp.market.uniqueKey,
            loanAsset: gp.market.loanAsset,
            collateralAsset: gp.market.collateralAsset,
            state: {
              netSupplyApy: gp.market.state.netSupplyApy ?? 0,
              supplyAssets: gp.market.state.supplyAssets,
              supplyShares: gp.market.state.supplyShares,
              supplyAssetsUsd: gp.market.state.supplyAssetsUsd,
            },
          },
          userState: {
            supplyShares,
            borrowShares,
            collateral,
          },
        }
      })
      .filter((p): p is LiveMarketPosition => p !== null)
  }, [graphPositions, positionResults])

  // Combined refetch function
  const refetch = async () => {
    await refetchGraph()
    await refetchPositions()
  }

  return {
    data: userPositions,
    isLoading: isLoadingGraph || isLoadingPositions,
    refetch,
    dataUpdatedAt: Math.max(graphUpdatedAt, rpcUpdatedAt),
  }
}
