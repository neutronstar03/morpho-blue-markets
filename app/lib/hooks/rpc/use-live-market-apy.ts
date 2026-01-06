import type { LiveMarketPosition } from './use-live-market-positions'

import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { useNetworkContext } from '~/lib/contexts/network'
import { adaptiveCurveBorrowRateView } from '~/lib/irm/adaptive-curve-irm'
import { apyFromRatePerSecondWad, supplyRatePerSecondWad, wadDivDown } from '~/lib/irm/apy-math'
import { computeMorphoMarketId, ZERO_ADDRESS } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { getMorphoBlueAddress } from './use-morpho'

export interface LiveApyResultByMarketKey {
  apy?: number // decimal fraction (e.g. 0.05 = 5%)
  isLive: boolean
}

function computeMarketId(p: LiveMarketPosition['market']): `0x${string}` | undefined {
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
 * Batched, on-chain “live APY”:
 * - Reads Morpho `market(id)` state for each market
 * - Reads IRM `rateAtTarget(marketId)` for each market (AdaptiveCurve-style)
 * - Computes borrowRate locally + converts to supply APY (fee + utilization)
 *
 * Uses a single multicall with `allowFailure` to keep UI resilient.
 */
export function useLiveMarketApy(positions: LiveMarketPosition[] | undefined) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  const markets = useMemo(() => (positions ?? []).map(p => p.market), [positions])

  const morphoAddress = useMemo(() => getMorphoBlueAddress(chainId), [chainId])

  const marketIds = useMemo(() => {
    const map = new Map<string, `0x${string}` | undefined>()
    for (const m of markets) {
      map.set(m.uniqueKey, computeMarketId(m))
    }
    return map
  }, [markets])

  const rateAtTargetCount = useMemo(
    () => markets.filter(m => marketIds.get(m.uniqueKey) != null).length,
    [markets, marketIds],
  )

  const marketRefetchInterval = markets.length > 0 && markets.length <= 20 ? 20_000 : undefined
  const rateAtTargetStaleTime = 5 * 60 * 1000

  const marketStateContracts = useMemo(() => {
    if (!markets.length || isWrongNetwork)
      return []
    return markets.map(m => ({
      address: morphoAddress,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'market',
      args: [m.uniqueKey as any] as const,
    }))
  }, [markets, isWrongNetwork, morphoAddress])

  const rateAtTargetContracts = useMemo(() => {
    if (!markets.length || isWrongNetwork)
      return []
    const calls: any[] = []
    for (const m of markets) {
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
  }, [markets, isWrongNetwork, marketIds])

  const { data: marketResults, isLoading: isMarketLoading } = useReadContracts({
    contracts: marketStateContracts as any,
    allowFailure: true,
    query: {
      enabled: !!chainId && !isWrongNetwork && markets.length > 0 && marketStateContracts.length > 0,
      refetchInterval: marketRefetchInterval,
    },
  })

  const { data: rateAtTargetResults, isLoading: isRateAtTargetLoading } = useReadContracts({
    contracts: rateAtTargetContracts as any,
    allowFailure: true,
    query: {
      enabled: !!chainId && !isWrongNetwork && rateAtTargetContracts.length > 0,
      staleTime: rateAtTargetStaleTime,
    },
  })

  const apyByMarketKey = useMemo<Record<string, LiveApyResultByMarketKey>>(() => {
    const out: Record<string, LiveApyResultByMarketKey> = {}
    for (const m of markets) {
      out[m.uniqueKey] = { apy: undefined, isLive: false }
    }

    if (!marketResults || marketResults.length < markets.length)
      return out

    const nowTimestamp = BigInt(Math.floor(Date.now() / 1000))

    // Market states
    const marketStateByKey = new Map<string, ReturnType<typeof normalizeMorphoMarketState>>()
    for (let i = 0; i < markets.length; i++) {
      const res = marketResults[i]
      if (res?.status !== 'success')
        continue
      const st = normalizeMorphoMarketState(res.result)
      if (!st)
        continue
      marketStateByKey.set(markets[i].uniqueKey, st)
    }

    // rateAtTarget (only for markets where we computed marketId)
    let ratIndex = 0
    const rateAtTargetByKey = new Map<string, bigint>()
    for (const m of markets) {
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

    for (const m of markets) {
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

      const utilizationWad = wadDivDown(totalBorrowAssets, totalSupplyAssets)
      const supplyRate = supplyRatePerSecondWad({ borrowRatePerSecondWad, utilizationWad, feeWad })

      out[m.uniqueKey] = {
        apy: apyFromRatePerSecondWad(supplyRate),
        isLive: true,
      }
    }

    return out
  }, [markets, marketResults, rateAtTargetResults, marketIds])

  return {
    apyByMarketKey,
    isLoading: isMarketLoading || isRateAtTargetLoading,
    refetchInterval: marketRefetchInterval,
    rateAtTargetCount,
  }
}
