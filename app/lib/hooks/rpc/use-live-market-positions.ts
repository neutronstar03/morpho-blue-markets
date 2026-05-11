import type { Address } from 'viem'
import type { SupportedChain } from '~/lib/addresses'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName, morphoAddressOnChain } from '~/lib/addresses'
import { useUserPositions } from '~/lib/hooks/graphql/use-user-positions'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { projectMorphoMarketAccrual } from '~/lib/morpho/project-accrual'

// This interface maps the GraphQL position data to what position.tsx expects
export interface LiveMarketPosition {
  market: {
    uniqueKey: string
    irmAddress: string
    oracleAddress?: string
    lltv?: string
    warnings?: Array<{
      type: string
      level: 'YELLOW' | 'RED'
    }>
    loanAsset: {
      symbol: string
      decimals: number | null
      address: string
      price?: {
        usd?: number | null
      } | null
    }
    collateralAsset: {
      symbol: string
      decimals: number | null
      address: string
    }
    state: {
      netSupplyApy: number
      utilization: number
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
  chainId: number
  abi: typeof SIMPLIFIED_MORPHO_BLUE_ABI
  functionName: 'position'
  args: readonly [`0x${string}`, `0x${string}`]
}

interface MarketCall {
  address: `0x${string}`
  chainId: number
  abi: typeof SIMPLIFIED_MORPHO_BLUE_ABI
  functionName: 'market'
  args: readonly [`0x${string}`]
}

interface RateAtTargetCall {
  address: `0x${string}`
  chainId: number
  abi: typeof IRM_RATE_AT_TARGET_ABI
  functionName: 'rateAtTarget'
  args: readonly [`0x${string}`]
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
export function useLiveMarketPositions(options: { address?: Address, chainId?: number } = {}) {
  const { address: connectedAddress, chain } = useAccount()
  const userAddress = options.address ?? connectedAddress
  const chainId = options.chainId ?? chain?.id
  const [projectionTimestamp, setProjectionTimestamp] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProjectionTimestamp(Math.floor(Date.now() / 1000))
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [])

  // Step 1: Efficient discovery via GraphQL
  // This returns only markets where user has a position, filtered by chainId
  const {
    data: graphPositions,
    isLoading: isLoadingGraph,
    refetch: refetchGraph,
    dataUpdatedAt: graphUpdatedAt,
  } = useUserPositions(userAddress, chainId)

  const morphoAddress = useMemo(() => {
    if (!chainId)
      return undefined
    const chainName = getSupportedChainName(chainId)
    if (chainName.startsWith('Chain '))
      return undefined
    return morphoAddressOnChain[chainName as SupportedChain]
  }, [chainId])

  // Step 2: Build RPC calls only for discovered positions
  const multicallContracts = useMemo<PositionCall[]>(() => {
    if (!graphPositions || !userAddress || !morphoAddress || !chainId)
      return []

    return graphPositions.map<PositionCall>(position => ({
      address: morphoAddress as `0x${string}`,
      chainId,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'position',
      args: [position.market.uniqueKey as `0x${string}`, userAddress as `0x${string}`] as const,
    }))
  }, [chainId, graphPositions, userAddress, morphoAddress])

  const marketContracts = useMemo<MarketCall[]>(() => {
    if (!graphPositions || !morphoAddress || !chainId)
      return []

    return graphPositions.map<MarketCall>(position => ({
      address: morphoAddress as `0x${string}`,
      chainId,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'market',
      args: [position.market.uniqueKey as `0x${string}`] as const,
    }))
  }, [chainId, graphPositions, morphoAddress])

  const rateAtTargetContracts = useMemo<RateAtTargetCall[]>(() => {
    if (!graphPositions || !chainId)
      return []

    return graphPositions
      .filter(position => !!position.market.irmAddress)
      .map<RateAtTargetCall>(position => ({
        address: position.market.irmAddress as `0x${string}`,
        chainId,
        abi: IRM_RATE_AT_TARGET_ABI,
        functionName: 'rateAtTarget',
        args: [position.market.uniqueKey as `0x${string}`] as const,
      }))
  }, [chainId, graphPositions])

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

  const {
    data: rateAtTargetResults,
    isLoading: isLoadingRateAtTarget,
    refetch: refetchRateAtTarget,
    dataUpdatedAt: rateAtTargetUpdatedAt,
  } = useReadContracts({
    contracts: rateAtTargetContracts,
    allowFailure: true,
    query: {
      enabled: !!graphPositions && graphPositions.length > 0 && rateAtTargetContracts.length > 0,
      staleTime: 5 * 60 * 1000,
    },
  })

  const {
    data: marketResults,
    isLoading: isLoadingMarkets,
    refetch: refetchMarkets,
    dataUpdatedAt: marketsUpdatedAt,
  } = useReadContracts({
    contracts: marketContracts,
    allowFailure: true,
    query: {
      enabled: !!graphPositions && graphPositions.length > 0 && !!morphoAddress,
      refetchInterval: 20_000,
    },
  })

  // Step 4: Merge GraphQL market data with live RPC position data
  const userPositions = useMemo<LiveMarketPosition[]>(() => {
    if (!graphPositions)
      return []

    const hasPositionResults = !!positionResults && positionResults.length === graphPositions.length
    const hasMarketResults = !!marketResults && marketResults.length === graphPositions.length
    const rateAtTargetByMarketKey = new Map<string, bigint>()

    if (rateAtTargetResults) {
      let rateIndex = 0
      for (const gp of graphPositions) {
        if (!gp.market.irmAddress)
          continue
        const rateResult = rateAtTargetResults[rateIndex]
        rateIndex++
        if (rateResult?.status !== 'success' || rateResult.result == null)
          continue
        rateAtTargetByMarketKey.set(gp.market.uniqueKey, rateResult.result as bigint)
      }
    }

    // If RPC data is not ready yet, use GraphQL data for display
    // This gives us immediate feedback while RPC is loading
    if (!hasPositionResults && !hasMarketResults) {
      return graphPositions.map((gp): LiveMarketPosition => ({
        market: {
          uniqueKey: gp.market.uniqueKey,
          irmAddress: gp.market.irmAddress,
          oracleAddress: gp.market.oracle?.address ?? undefined,
          lltv: gp.market.lltv ?? undefined,
          warnings: gp.market.warnings,
          loanAsset: gp.market.loanAsset,
          collateralAsset: gp.market.collateralAsset,
          state: {
            netSupplyApy: gp.market.state.netSupplyApy ?? 0,
            utilization: gp.market.state.utilization,
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
        const result = hasPositionResults ? positionResults[index] : undefined
        const marketResult = hasMarketResults ? marketResults[index] : undefined

        // Use live RPC data if available, otherwise fall back to GraphQL
        let supplyShares: bigint
        let borrowShares: bigint
        let collateral: bigint

        let marketSupplyAssets = gp.market.state.supplyAssets
        let marketSupplyShares = gp.market.state.supplyShares
        let marketStateSupplyUsd = gp.market.state.supplyAssetsUsd
        let marketUtilization = gp.market.state.utilization

        if (result?.status === 'success' && result.result) {
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

        if (marketResult?.status === 'success' && marketResult.result) {
          const marketState = normalizeMorphoMarketState(marketResult.result)
          if (marketState) {
            const rateAtTarget = rateAtTargetByMarketKey.get(gp.market.uniqueKey)
            const projectedMarketState = rateAtTarget == null
              ? marketState
              : projectMorphoMarketAccrual({
                  marketId: gp.market.uniqueKey as `0x${string}`,
                  market: marketState,
                  rateAtTarget,
                  timestamp: BigInt(projectionTimestamp),
                })

            marketSupplyAssets = projectedMarketState.totalSupplyAssets.toString()
            marketSupplyShares = projectedMarketState.totalSupplyShares.toString()
            marketUtilization = projectedMarketState.totalSupplyAssets > 0n
              ? Number(projectedMarketState.totalBorrowAssets) / Number(projectedMarketState.totalSupplyAssets)
              : 0

            const loanPriceUsd = gp.market.loanAsset.price?.usd
            if (loanPriceUsd != null) {
              const decimals = gp.market.loanAsset.decimals ?? 18
              const scale = 10 ** decimals
              marketStateSupplyUsd = Number(projectedMarketState.totalSupplyAssets) / scale * loanPriceUsd
            }
          }
        }

        // Filter out zero positions (user may have exited since GraphQL indexed)
        const hasVisibleSupply = hasVisibleSuppliedAssets({
          userSupplyShares: supplyShares,
          totalSupplyAssets: marketSupplyAssets,
          totalSupplyShares: marketSupplyShares,
        })
        const hasPosition = hasVisibleSupply || borrowShares > 0n || collateral > 0n
        if (!hasPosition)
          return null

        return {
          market: {
            uniqueKey: gp.market.uniqueKey,
            irmAddress: gp.market.irmAddress,
            oracleAddress: gp.market.oracle?.address ?? undefined,
            lltv: gp.market.lltv ?? undefined,
            warnings: gp.market.warnings,
            loanAsset: gp.market.loanAsset,
            collateralAsset: gp.market.collateralAsset,
            state: {
              netSupplyApy: gp.market.state.netSupplyApy ?? 0,
              utilization: marketUtilization,
              supplyAssets: marketSupplyAssets,
              supplyShares: marketSupplyShares,
              supplyAssetsUsd: marketStateSupplyUsd,
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
  }, [graphPositions, marketResults, positionResults, projectionTimestamp, rateAtTargetResults])

  // Combined refetch function
  const refetch = async () => {
    await refetchGraph()
    await refetchPositions()
    await refetchMarkets()
    await refetchRateAtTarget()
  }

  return {
    data: userPositions,
    isLoading: isLoadingGraph || isLoadingPositions || isLoadingMarkets || isLoadingRateAtTarget,
    refetch,
    dataUpdatedAt: Math.max(graphUpdatedAt, rpcUpdatedAt, marketsUpdatedAt, rateAtTargetUpdatedAt),
  }
}
