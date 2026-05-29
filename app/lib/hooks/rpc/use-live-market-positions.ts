import type { Address } from 'viem'
import type { SupportedChain } from '~/lib/addresses'
import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import type { LiveMarketPosition } from '~/lib/morpho/live-position'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName, morphoAddressOnChain } from '~/lib/addresses'
import { useUserPositions } from '~/lib/hooks/graphql/use-user-positions'
import { buildLiveMarketPosition, liveMarketMetadataFromGraphPosition, liveMarketMetadataFromMarket } from '~/lib/morpho/live-position'

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
export function useLiveMarketPositions(options: { address?: Address, chainId?: number, refreshKey?: number } = {}) {
  const { address: connectedAddress, chain } = useAccount()
  const userAddress = options.address ?? connectedAddress
  const chainId = options.chainId ?? chain?.id
  const [readInstanceKey] = useState(() => Date.now())
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
    isFetching: isFetchingGraph,
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

  const liveReadScopeKey = useMemo(() => {
    return `live-market-positions:${chainId ?? 'none'}:${userAddress ?? 'none'}:${options.refreshKey ?? 0}:${readInstanceKey}`
  }, [chainId, options.refreshKey, readInstanceKey, userAddress])

  // Step 3: Fetch live position data from RPC
  const {
    data: positionResults,
    isLoading: isLoadingPositions,
    isFetching: isFetchingPositions,
    refetch: refetchPositions,
    dataUpdatedAt: rpcUpdatedAt,
  } = useReadContracts({
    contracts: multicallContracts,
    allowFailure: true,
    scopeKey: `${liveReadScopeKey}:positions`,
    query: {
      enabled: !!graphPositions && graphPositions.length > 0 && !!userAddress && !!morphoAddress,
      refetchOnMount: 'always',
      refetchInterval: 20_000,
      staleTime: 0,
    },
  })

  const {
    data: rateAtTargetResults,
    isLoading: isLoadingRateAtTarget,
    isFetching: isFetchingRateAtTarget,
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
    isFetching: isFetchingMarkets,
    refetch: refetchMarkets,
    dataUpdatedAt: marketsUpdatedAt,
  } = useReadContracts({
    contracts: marketContracts,
    allowFailure: true,
    scopeKey: `${liveReadScopeKey}:markets`,
    query: {
      enabled: !!graphPositions && graphPositions.length > 0 && !!morphoAddress,
      refetchOnMount: 'always',
      refetchInterval: 20_000,
      staleTime: 0,
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

    return graphPositions
      .map((gp, index): LiveMarketPosition | null => {
        const result = hasPositionResults ? positionResults[index] : undefined
        const marketResult = hasMarketResults ? marketResults[index] : undefined
        if (result?.status !== 'success' || marketResult?.status !== 'success')
          return null

        return buildLiveMarketPosition({
          metadata: liveMarketMetadataFromGraphPosition(gp),
          graphUserState: gp.state,
          positionResult: result.result,
          marketResult: marketResult.result,
          rateAtTarget: rateAtTargetByMarketKey.get(gp.market.uniqueKey),
          projectionTimestamp,
        })
      })
      .filter((p): p is LiveMarketPosition => p !== null)
  }, [graphPositions, marketResults, positionResults, projectionTimestamp, rateAtTargetResults])

  // Combined refetch function
  const refetch = useCallback(async () => {
    await refetchGraph()
    await refetchPositions()
    await refetchMarkets()
    await refetchRateAtTarget()
  }, [refetchGraph, refetchMarkets, refetchPositions, refetchRateAtTarget])

  useEffect(() => {
    if (!options.refreshKey)
      return
    void refetch()
  }, [options.refreshKey, refetch])

  const hasPendingLiveReads = !!graphPositions?.length && (!positionResults || !marketResults)

  return {
    data: userPositions,
    isLoading: isLoadingGraph || isLoadingPositions || isLoadingMarkets || isLoadingRateAtTarget || hasPendingLiveReads,
    isFetching: isFetchingGraph || isFetchingPositions || isFetchingMarkets || isFetchingRateAtTarget,
    refetch,
    dataUpdatedAt: Math.max(graphUpdatedAt, rpcUpdatedAt, marketsUpdatedAt, rateAtTargetUpdatedAt),
  }
}

export function useLiveMarketPosition(options: { market: SingleMorphoMarket, address?: Address }) {
  const { market, address } = options
  const chainId = market.morphoBlue.chain.id
  const morphoAddress = useMemo(() => {
    const chainName = getSupportedChainName(chainId)
    if (chainName.startsWith('Chain '))
      return undefined
    return morphoAddressOnChain[chainName as SupportedChain]
  }, [chainId])
  const [projectionTimestamp, setProjectionTimestamp] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProjectionTimestamp(Math.floor(Date.now() / 1000))
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [])

  const {
    data: positionResult,
    isLoading: isLoadingPosition,
    refetch: refetchPosition,
    dataUpdatedAt: positionUpdatedAt,
  } = useReadContract({
    chainId,
    address: morphoAddress,
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'position',
    args: address && morphoAddress
      ? [market.uniqueKey as `0x${string}`, address as `0x${string}`]
      : undefined,
    query: {
      enabled: !!address && !!morphoAddress && !!market.uniqueKey,
      refetchOnMount: 'always',
      refetchInterval: 20_000,
      staleTime: 0,
    },
  })

  const {
    data: marketResult,
    isLoading: isLoadingMarket,
    refetch: refetchMarket,
    dataUpdatedAt: marketUpdatedAt,
  } = useReadContract({
    chainId,
    address: morphoAddress,
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'market',
    args: morphoAddress ? [market.uniqueKey as `0x${string}`] : undefined,
    query: {
      enabled: !!morphoAddress && !!market.uniqueKey,
      refetchOnMount: 'always',
      refetchInterval: 20_000,
      staleTime: 0,
    },
  })

  const {
    data: rateAtTarget,
    isLoading: isLoadingRateAtTarget,
    refetch: refetchRateAtTarget,
    dataUpdatedAt: rateAtTargetUpdatedAt,
  } = useReadContract({
    chainId,
    address: market.irmAddress as `0x${string}`,
    abi: IRM_RATE_AT_TARGET_ABI,
    functionName: 'rateAtTarget',
    args: [market.uniqueKey as `0x${string}`],
    query: {
      enabled: !!market.irmAddress && !!market.uniqueKey,
      staleTime: 5 * 60 * 1000,
    },
  })

  const position = useMemo(() => {
    return buildLiveMarketPosition({
      metadata: liveMarketMetadataFromMarket(market),
      positionResult,
      marketResult,
      rateAtTarget,
      projectionTimestamp,
    })
  }, [market, marketResult, positionResult, projectionTimestamp, rateAtTarget])

  const refetch = async () => {
    await refetchPosition()
    await refetchMarket()
    await refetchRateAtTarget()
  }

  return {
    data: position,
    isLoading: isLoadingPosition || isLoadingMarket || isLoadingRateAtTarget,
    refetch,
    dataUpdatedAt: Math.max(positionUpdatedAt, marketUpdatedAt, rateAtTargetUpdatedAt),
  }
}
