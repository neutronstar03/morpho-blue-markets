import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { useNetworkContext } from '~/lib/contexts/network'
import { adaptiveCurveBorrowRateView } from '~/lib/irm/adaptive-curve-irm'
import { clampRatePerSecondWad, displayAprFromRatePerSecondWad, supplyRatePerSecondWad, wadDivDown } from '~/lib/irm/apy-math'
import { computeMorphoMarketId, ZERO_ADDRESS } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { getMorphoBlueAddress } from './use-morpho'

export interface LiveAprResultByMarketKey {
  apr?: number // decimal fraction (e.g. 0.05 = 5%)
  borrowApr?: number // decimal fraction (e.g. 0.05 = 5%)
  isLive: boolean
}

export interface LiveAprMarketInput {
  uniqueKey: string
  irmAddress: string
  oracleAddress?: string
  lltv?: string
  loanAsset: { address: string, symbol?: string | null }
  collateralAsset: { address: string, symbol?: string | null }
}

function computeMarketId(p: LiveAprMarketInput): `0x${string}` | undefined {
  const oracle = (p.oracleAddress ?? ZERO_ADDRESS) as `0x${string}`
  if (!p.lltv)
    return undefined
  try {
    const lltv = BigInt(p.lltv)
    return computeMorphoMarketId({
      loanToken: p.loanAsset.address as `0x${string}`,
      collateralToken: p.collateralAsset.address as `0x${string}`,
      oracle,
      irm: p.irmAddress as `0x${string}`,
      lltv,
    })
  }
  catch {
    return undefined
  }
}

/**
 * Batched, on-chain “live APR”:
 * - Reads Morpho `market(id)` state for each market
 * - Reads IRM `rateAtTarget(marketId)` for each market (AdaptiveCurve-style)
 * - Computes borrowRate locally + converts to supply APR (fee + utilization)
 *
 * Uses a single multicall with `allowFailure` to keep UI resilient.
 */
export function useLiveMarketApr(markets: LiveAprMarketInput[] | undefined) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  const MARKET_CHUNK_SIZE = 20
  const MAX_CHUNKS = 5 // matches default `useMarkets(first=100)`

  const marketsSafe = useMemo(() => {
    return markets ?? []
  }, [markets])

  const morphoAddress = useMemo(() => getMorphoBlueAddress(chainId), [chainId])

  const marketIds = useMemo(() => {
    const map = new Map<string, `0x${string}` | undefined>()
    for (const m of marketsSafe) {
      map.set(m.uniqueKey, computeMarketId(m))
    }
    return map
  }, [marketsSafe])

  const rateAtTargetCount = useMemo(
    () => marketsSafe.filter(m => marketIds.get(m.uniqueKey) != null).length,
    [marketsSafe, marketIds],
  )

  const marketRefetchInterval = marketsSafe.length > 0 && marketsSafe.length <= 20 ? 20_000 : undefined
  const rateAtTargetStaleTime = 5 * 60 * 1000

  const chunkedMarkets = useMemo(() => {
    const src = marketsSafe
    const out: LiveAprMarketInput[][] = []
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const start = i * MARKET_CHUNK_SIZE
      const end = start + MARKET_CHUNK_SIZE
      const chunk = src.slice(start, end)
      out.push(chunk)
    }
    return out
  }, [marketsSafe])

  function buildMarketStateContracts(chunk: LiveAprMarketInput[]) {
    if (!chunk.length || isWrongNetwork)
      return []
    return chunk.map(m => ({
      address: morphoAddress,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'market',
      args: [m.uniqueKey as any] as const,
    }))
  }

  function buildRateAtTargetContracts(chunk: LiveAprMarketInput[]) {
    if (!chunk.length || isWrongNetwork)
      return []
    const calls: any[] = []
    for (const m of chunk) {
      const marketId = marketIds.get(m.uniqueKey)
      if (!marketId)
        continue
      calls.push({
        address: m.irmAddress as `0x${string}`,
        abi: IRM_RATE_AT_TARGET_ABI,
        functionName: 'rateAtTarget',
        args: [marketId] as const,
      })
    }
    return calls
  }

  const marketStateContracts0 = useMemo(() => buildMarketStateContracts(chunkedMarkets[0] ?? []), [chunkedMarkets, morphoAddress, isWrongNetwork])
  const marketStateContracts1 = useMemo(() => buildMarketStateContracts(chunkedMarkets[1] ?? []), [chunkedMarkets, morphoAddress, isWrongNetwork])
  const marketStateContracts2 = useMemo(() => buildMarketStateContracts(chunkedMarkets[2] ?? []), [chunkedMarkets, morphoAddress, isWrongNetwork])
  const marketStateContracts3 = useMemo(() => buildMarketStateContracts(chunkedMarkets[3] ?? []), [chunkedMarkets, morphoAddress, isWrongNetwork])
  const marketStateContracts4 = useMemo(() => buildMarketStateContracts(chunkedMarkets[4] ?? []), [chunkedMarkets, morphoAddress, isWrongNetwork])

  const rateAtTargetContracts0 = useMemo(() => buildRateAtTargetContracts(chunkedMarkets[0] ?? []), [chunkedMarkets, isWrongNetwork, marketIds])
  const rateAtTargetContracts1 = useMemo(() => buildRateAtTargetContracts(chunkedMarkets[1] ?? []), [chunkedMarkets, isWrongNetwork, marketIds])
  const rateAtTargetContracts2 = useMemo(() => buildRateAtTargetContracts(chunkedMarkets[2] ?? []), [chunkedMarkets, isWrongNetwork, marketIds])
  const rateAtTargetContracts3 = useMemo(() => buildRateAtTargetContracts(chunkedMarkets[3] ?? []), [chunkedMarkets, isWrongNetwork, marketIds])
  const rateAtTargetContracts4 = useMemo(() => buildRateAtTargetContracts(chunkedMarkets[4] ?? []), [chunkedMarkets, isWrongNetwork, marketIds])

  const enabledBase = !!chainId && !isWrongNetwork && marketsSafe.length > 0

  const { data: marketResults0, isLoading: isMarketLoading0 } = useReadContracts({
    contracts: marketStateContracts0 as any,
    allowFailure: true,
    query: { enabled: enabledBase && marketStateContracts0.length > 0, refetchInterval: marketRefetchInterval },
  })
  const { data: marketResults1, isLoading: isMarketLoading1 } = useReadContracts({
    contracts: marketStateContracts1 as any,
    allowFailure: true,
    query: { enabled: enabledBase && marketStateContracts1.length > 0, refetchInterval: marketRefetchInterval },
  })
  const { data: marketResults2, isLoading: isMarketLoading2 } = useReadContracts({
    contracts: marketStateContracts2 as any,
    allowFailure: true,
    query: { enabled: enabledBase && marketStateContracts2.length > 0, refetchInterval: marketRefetchInterval },
  })
  const { data: marketResults3, isLoading: isMarketLoading3 } = useReadContracts({
    contracts: marketStateContracts3 as any,
    allowFailure: true,
    query: { enabled: enabledBase && marketStateContracts3.length > 0, refetchInterval: marketRefetchInterval },
  })
  const { data: marketResults4, isLoading: isMarketLoading4 } = useReadContracts({
    contracts: marketStateContracts4 as any,
    allowFailure: true,
    query: { enabled: enabledBase && marketStateContracts4.length > 0, refetchInterval: marketRefetchInterval },
  })

  const { data: rateAtTargetResults0, isLoading: isRateAtTargetLoading0 } = useReadContracts({
    contracts: rateAtTargetContracts0 as any,
    allowFailure: true,
    query: { enabled: enabledBase && rateAtTargetContracts0.length > 0, staleTime: rateAtTargetStaleTime },
  })
  const { data: rateAtTargetResults1, isLoading: isRateAtTargetLoading1 } = useReadContracts({
    contracts: rateAtTargetContracts1 as any,
    allowFailure: true,
    query: { enabled: enabledBase && rateAtTargetContracts1.length > 0, staleTime: rateAtTargetStaleTime },
  })
  const { data: rateAtTargetResults2, isLoading: isRateAtTargetLoading2 } = useReadContracts({
    contracts: rateAtTargetContracts2 as any,
    allowFailure: true,
    query: { enabled: enabledBase && rateAtTargetContracts2.length > 0, staleTime: rateAtTargetStaleTime },
  })
  const { data: rateAtTargetResults3, isLoading: isRateAtTargetLoading3 } = useReadContracts({
    contracts: rateAtTargetContracts3 as any,
    allowFailure: true,
    query: { enabled: enabledBase && rateAtTargetContracts3.length > 0, staleTime: rateAtTargetStaleTime },
  })
  const { data: rateAtTargetResults4, isLoading: isRateAtTargetLoading4 } = useReadContracts({
    contracts: rateAtTargetContracts4 as any,
    allowFailure: true,
    query: { enabled: enabledBase && rateAtTargetContracts4.length > 0, staleTime: rateAtTargetStaleTime },
  })

  const aprByMarketKey = useMemo<Record<string, LiveAprResultByMarketKey>>(() => {
    const out: Record<string, LiveAprResultByMarketKey> = {}
    for (const m of marketsSafe) {
      out[m.uniqueKey] = { apr: undefined, isLive: false }
    }

    const nowTimestamp = BigInt(Math.floor(Date.now() / 1000))

    const marketResultsAll = [
      marketResults0,
      marketResults1,
      marketResults2,
      marketResults3,
      marketResults4,
    ] as const
    const rateAtTargetResultsAll = [
      rateAtTargetResults0,
      rateAtTargetResults1,
      rateAtTargetResults2,
      rateAtTargetResults3,
      rateAtTargetResults4,
    ] as const

    for (let chunkIndex = 0; chunkIndex < MAX_CHUNKS; chunkIndex++) {
      const chunk = chunkedMarkets[chunkIndex] ?? []
      if (!chunk.length)
        continue

      const marketResults = marketResultsAll[chunkIndex]
      if (!marketResults || marketResults.length < chunk.length)
        continue

      // Market states (chunk)
      const marketStateByKey = new Map<string, ReturnType<typeof normalizeMorphoMarketState>>()
      for (let i = 0; i < chunk.length; i++) {
        const res = marketResults[i]
        if (res?.status !== 'success')
          continue
        const st = normalizeMorphoMarketState(res.result)
        if (!st)
          continue
        marketStateByKey.set(chunk[i].uniqueKey, st)
      }

      // rateAtTarget (chunk, only for markets where we computed marketId)
      let ratIndex = 0
      const rateAtTargetByKey = new Map<string, bigint>()
      const rateAtTargetResults = rateAtTargetResultsAll[chunkIndex]
      for (const m of chunk) {
        const marketId = marketIds.get(m.uniqueKey)
        if (!marketId)
          continue
        const res = rateAtTargetResults?.[ratIndex]
        ratIndex++
        if (res?.status !== 'success')
          continue
        const r = res.result as bigint
        rateAtTargetByKey.set(m.uniqueKey, r)
      }

      for (const m of chunk) {
        const tuple = marketStateByKey.get(m.uniqueKey)
        const rateAtTarget = rateAtTargetByKey.get(m.uniqueKey)
        const marketId = marketIds.get(m.uniqueKey)

        if (!tuple || rateAtTarget == null || !marketId)
          continue

        const totalSupplyAssets = tuple.totalSupplyAssets
        const totalBorrowAssets = tuple.totalBorrowAssets
        const lastUpdate = tuple.lastUpdate
        const feeWad = tuple.fee

        const borrowRatePerSecondWad = adaptiveCurveBorrowRateView({
          marketId,
          rateAtTarget,
          market: { totalSupplyAssets, totalBorrowAssets, lastUpdate },
          timestamp: nowTimestamp,
        })

        const borrowRatePerSecondWadClamped = clampRatePerSecondWad(borrowRatePerSecondWad)
        const utilizationWad = wadDivDown(totalBorrowAssets, totalSupplyAssets)
        const supplyRate = supplyRatePerSecondWad({ borrowRatePerSecondWad: borrowRatePerSecondWadClamped, utilizationWad, feeWad })

        out[m.uniqueKey] = {
          apr: displayAprFromRatePerSecondWad(supplyRate),
          borrowApr: displayAprFromRatePerSecondWad(borrowRatePerSecondWadClamped),
          isLive: true,
        }
      }
    }

    return out
  }, [
    marketsSafe,
    chunkedMarkets,
    marketIds,
    marketResults0,
    marketResults1,
    marketResults2,
    marketResults3,
    marketResults4,
    rateAtTargetResults0,
    rateAtTargetResults1,
    rateAtTargetResults2,
    rateAtTargetResults3,
    rateAtTargetResults4,
  ])

  return {
    aprByMarketKey,
    isLoading: isMarketLoading0
      || isMarketLoading1
      || isMarketLoading2
      || isMarketLoading3
      || isMarketLoading4
      || isRateAtTargetLoading0
      || isRateAtTargetLoading1
      || isRateAtTargetLoading2
      || isRateAtTargetLoading3
      || isRateAtTargetLoading4,
    refetchInterval: marketRefetchInterval,
    rateAtTargetCount,
  }
}
