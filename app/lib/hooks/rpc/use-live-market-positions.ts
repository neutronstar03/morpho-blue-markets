import type { Address } from 'viem'
import type { SupportedChain } from '~/lib/addresses'
import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import type { UserPosition } from '~/lib/hooks/graphql/use-user-positions'

import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName, morphoAddressOnChain } from '~/lib/addresses'
import { useUserPositions } from '~/lib/hooks/graphql/use-user-positions'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { getSuppliedAssetsFromShares, hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
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
  userState: {
    supplyShares: bigint
    borrowShares: bigint
    collateral: bigint
  }
  liveState?: {
    suppliedAssets: bigint
    projectedSuppliedAssets?: bigint
    secondsSinceLastMarketUpdate?: bigint
  }
}

type LiveMarketMetadata = Pick<UserPosition['market'], 'uniqueKey' | 'irmAddress' | 'lltv' | 'warnings' | 'loanAsset' | 'collateralAsset'> & {
  oracleAddress?: string
  state: Pick<UserPosition['market']['state'], 'netSupplyApy' | 'utilization' | 'supplyAssets' | 'supplyShares' | 'supplyAssetsUsd' | 'rewards'>
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

function liveMarketMetadataFromGraphPosition(position: UserPosition): LiveMarketMetadata {
  return {
    uniqueKey: position.market.uniqueKey,
    irmAddress: position.market.irmAddress,
    oracleAddress: position.market.oracle?.address ?? undefined,
    lltv: position.market.lltv ?? undefined,
    warnings: position.market.warnings,
    loanAsset: position.market.loanAsset,
    collateralAsset: position.market.collateralAsset,
    state: position.market.state,
  }
}

function liveMarketMetadataFromMarket(market: SingleMorphoMarket): LiveMarketMetadata {
  return {
    uniqueKey: market.uniqueKey,
    irmAddress: market.irmAddress,
    oracleAddress: market.oracleAddress,
    lltv: market.lltv,
    warnings: market.warnings,
    loanAsset: market.loanAsset,
    collateralAsset: market.collateralAsset,
    state: {
      netSupplyApy: market.state.netSupplyApy,
      utilization: market.state.utilization,
      supplyAssets: '0',
      supplyShares: '0',
      supplyAssetsUsd: market.state.supplyAssetsUsd,
      rewards: null,
    },
  }
}

function buildLiveMarketPosition(args: {
  metadata: LiveMarketMetadata
  graphUserState?: UserPosition['state']
  positionResult?: unknown
  marketResult?: unknown
  rateAtTarget?: bigint
  projectionTimestamp: number
}): LiveMarketPosition | null {
  const { metadata, graphUserState, positionResult, marketResult, rateAtTarget, projectionTimestamp } = args

  let supplyShares = BigInt(graphUserState?.supplyShares || '0')
  let borrowShares = BigInt(graphUserState?.borrowShares || '0')
  let collateral = BigInt(graphUserState?.collateral || '0')

  let marketSupplyAssets = metadata.state.supplyAssets
  let marketSupplyShares = metadata.state.supplyShares
  let marketStateSupplyUsd = metadata.state.supplyAssetsUsd
  let marketUtilization = metadata.state.utilization
  let suppliedAssets: bigint | undefined
  let projectedSuppliedAssets: bigint | undefined
  let secondsSinceLastMarketUpdate: bigint | undefined

  if (Array.isArray(positionResult)) {
    const [ss, bs, col] = positionResult as unknown as readonly [bigint, bigint, bigint]
    supplyShares = ss
    borrowShares = bs
    collateral = col
  }

  const marketState = normalizeMorphoMarketState(marketResult)
  if (marketState) {
    suppliedAssets = getSuppliedAssetsFromShares({
      userSupplyShares: supplyShares,
      totalSupplyAssets: marketState.totalSupplyAssets,
      totalSupplyShares: marketState.totalSupplyShares,
    })

    const timestamp = BigInt(projectionTimestamp)
    const projectedMarketState = rateAtTarget == null
      ? marketState
      : projectMorphoMarketAccrual({
          marketId: metadata.uniqueKey as `0x${string}`,
          market: marketState,
          rateAtTarget,
          timestamp,
        })

    marketSupplyAssets = projectedMarketState.totalSupplyAssets.toString()
    marketSupplyShares = projectedMarketState.totalSupplyShares.toString()
    marketUtilization = projectedMarketState.totalSupplyAssets > 0n
      ? Number(projectedMarketState.totalBorrowAssets) / Number(projectedMarketState.totalSupplyAssets)
      : 0
    projectedSuppliedAssets = getSuppliedAssetsFromShares({
      userSupplyShares: supplyShares,
      totalSupplyAssets: projectedMarketState.totalSupplyAssets,
      totalSupplyShares: projectedMarketState.totalSupplyShares,
    })
    secondsSinceLastMarketUpdate = timestamp > marketState.lastUpdate ? timestamp - marketState.lastUpdate : 0n

    const loanPriceUsd = metadata.loanAsset.price?.usd
    if (loanPriceUsd != null) {
      const decimals = metadata.loanAsset.decimals ?? 18
      const scale = 10 ** decimals
      marketStateSupplyUsd = Number(projectedMarketState.totalSupplyAssets) / scale * loanPriceUsd
    }
  }

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
      uniqueKey: metadata.uniqueKey,
      irmAddress: metadata.irmAddress,
      oracleAddress: metadata.oracleAddress,
      lltv: metadata.lltv,
      warnings: metadata.warnings,
      loanAsset: metadata.loanAsset,
      collateralAsset: metadata.collateralAsset,
      state: {
        netSupplyApy: metadata.state.netSupplyApy ?? 0,
        utilization: marketUtilization,
        supplyAssets: marketSupplyAssets,
        supplyShares: marketSupplyShares,
        supplyAssetsUsd: marketStateSupplyUsd,
        rewards: metadata.state.rewards,
      },
    },
    userState: {
      supplyShares,
      borrowShares,
      collateral,
    },
    liveState: {
      suppliedAssets: suppliedAssets ?? getSuppliedAssetsFromShares({
        userSupplyShares: supplyShares,
        totalSupplyAssets: marketSupplyAssets,
        totalSupplyShares: marketSupplyShares,
      }),
      projectedSuppliedAssets,
      secondsSinceLastMarketUpdate,
    },
  }
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
      refetchOnMount: 'always',
      refetchInterval: 20_000,
      staleTime: 0,
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

    // If RPC data is not ready yet, use GraphQL data for display
    // This gives us immediate feedback while RPC is loading
    if (!hasPositionResults && !hasMarketResults) {
      return graphPositions
        .map(gp => buildLiveMarketPosition({
          metadata: liveMarketMetadataFromGraphPosition(gp),
          graphUserState: gp.state,
          projectionTimestamp,
        }))
        .filter((p): p is LiveMarketPosition => p !== null)
    }

    // Merge with live RPC data
    return graphPositions
      .map((gp, index): LiveMarketPosition | null => {
        const result = hasPositionResults ? positionResults[index] : undefined
        const marketResult = hasMarketResults ? marketResults[index] : undefined

        return buildLiveMarketPosition({
          metadata: liveMarketMetadataFromGraphPosition(gp),
          graphUserState: gp.state,
          positionResult: result?.status === 'success' ? result.result : undefined,
          marketResult: marketResult?.status === 'success' ? marketResult.result : undefined,
          rateAtTarget: rateAtTargetByMarketKey.get(gp.market.uniqueKey),
          projectionTimestamp,
        })
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
