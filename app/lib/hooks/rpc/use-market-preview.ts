import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { IRM_RATE_AT_TARGET_ABI } from '~/lib/abis/simplified'
import { useNetworkContext } from '~/lib/contexts/network'
import { adaptiveCurveBorrowRateView } from '~/lib/irm/adaptive-curve-irm'
import { displayApyFromRatePerSecondWad, supplyRatePerSecondWad, wadDivDown } from '~/lib/irm/apy-math'
import { computeMorphoMarketId } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'

// Minimal ABI for AdaptiveCurveIRM-style borrowRateView(marketParams, market) -> ratePerSecondWad
const IRM_BORROW_RATE_VIEW_ABI = [
  {
    type: 'function',
    name: 'borrowRateView',
    stateMutability: 'view',
    inputs: [
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
      },
      {
        name: 'market',
        type: 'tuple',
        components: [
          { name: 'totalSupplyAssets', type: 'uint128' },
          { name: 'totalSupplyShares', type: 'uint128' },
          { name: 'totalBorrowAssets', type: 'uint128' },
          { name: 'totalBorrowShares', type: 'uint128' },
          { name: 'lastUpdate', type: 'uint128' },
          { name: 'fee', type: 'uint128' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export type MorphoMarketStateTuple = NonNullable<ReturnType<typeof normalizeMorphoMarketState>>

export function useMarketPreview(args: {
  market: SingleMorphoMarket
  marketStateRaw: unknown | undefined
  deltaSupplyAssets: bigint // + for supply, - for withdraw (raw loan token units)
}) {
  const { market, marketStateRaw, deltaSupplyAssets } = args
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  const marketState = useMemo(() => normalizeMorphoMarketState(marketStateRaw), [marketStateRaw])

  const marketParams = useMemo(() => {
    return {
      loanToken: market.loanAsset.address as `0x${string}`,
      collateralToken: market.collateralAsset.address as `0x${string}`,
      oracle: market.oracleAddress as `0x${string}`,
      irm: market.irmAddress as `0x${string}`,
      lltv: BigInt(market.lltv),
    } as const
  }, [market])

  const marketId = useMemo(() => {
    return computeMorphoMarketId({
      loanToken: marketParams.loanToken,
      collateralToken: marketParams.collateralToken,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: marketParams.lltv,
    })
  }, [marketParams])

  const before = useMemo(() => {
    if (!marketState)
      return undefined
    return {
      ...marketState,
    } as const
  }, [marketState])

  const after = useMemo(() => {
    if (!marketState)
      return undefined
    const nextSupply = marketState.totalSupplyAssets + deltaSupplyAssets
    return {
      ...marketState,
      totalSupplyAssets: nextSupply > 0n ? nextSupply : 0n,
    } as const
  }, [marketState, deltaSupplyAssets])

  const utilizationBeforeWad = useMemo(() => {
    if (!before)
      return undefined
    return wadDivDown(before.totalBorrowAssets, before.totalSupplyAssets)
  }, [before])

  const utilizationAfterWad = useMemo(() => {
    if (!after)
      return undefined
    return wadDivDown(after.totalBorrowAssets, after.totalSupplyAssets)
  }, [after])

  const enabled = !!marketState && !isWrongNetwork && !!chainId

  // Prefer local IRM math when possible:
  // - avoids hammering RPC while the user drags the slider
  // - still accurate *as long as* we have the onchain `rateAtTarget[id]`
  // Note: non-AdaptiveCurve IRMs won't have `rateAtTarget`, so we fall back to borrowRateView RPC.
  const rateAtTargetContracts = useMemo(() => {
    if (!enabled)
      return []
    return [
      {
        address: market.irmAddress as `0x${string}`,
        abi: IRM_RATE_AT_TARGET_ABI,
        functionName: 'rateAtTarget',
        args: [marketId] as const,
      },
    ] as const
  }, [enabled, market.irmAddress, marketId])

  const { data: rateAtTargetResult } = useReadContracts({
    contracts: rateAtTargetContracts as any,
    allowFailure: true,
    query: { enabled: enabled && rateAtTargetContracts.length > 0 },
  })

  const rateAtTarget = (rateAtTargetResult?.[0]?.status === 'success'
    ? rateAtTargetResult[0].result
    : undefined) as bigint | undefined

  const canUseLocalIrm = enabled && before != null && after != null && rateAtTarget != null

  const rateAtTargetApy = useMemo(() => {
    if (rateAtTarget == null)
      return undefined
    // rateAtTarget is per-second WAD (int256 onchain). Negative rates are treated as 0 for display.
    return displayApyFromRatePerSecondWad(rateAtTarget > 0n ? rateAtTarget : 0n)
  }, [rateAtTarget])

  const nowTimestamp = useMemo(() => {
    // For UX we don't need exact block timestamp here. Using wall clock removes an extra RPC call.
    return BigInt(Math.floor(Date.now() / 1000))
  }, [marketStateRaw, deltaSupplyAssets])

  const localBorrowRateBefore = useMemo(() => {
    if (!canUseLocalIrm)
      return undefined
    return adaptiveCurveBorrowRateView({
      marketId,
      rateAtTarget,
      market: {
        totalSupplyAssets: before!.totalSupplyAssets,
        totalBorrowAssets: before!.totalBorrowAssets,
        lastUpdate: before!.lastUpdate,
      },
      timestamp: nowTimestamp,
    })
  }, [canUseLocalIrm, marketId, rateAtTarget, before, nowTimestamp])

  const localBorrowRateAfter = useMemo(() => {
    if (!canUseLocalIrm)
      return undefined
    return adaptiveCurveBorrowRateView({
      marketId,
      rateAtTarget,
      market: {
        totalSupplyAssets: after!.totalSupplyAssets,
        totalBorrowAssets: after!.totalBorrowAssets,
        lastUpdate: after!.lastUpdate,
      },
      timestamp: nowTimestamp,
    })
  }, [canUseLocalIrm, marketId, rateAtTarget, after, nowTimestamp])

  const contracts = useMemo(() => {
    if (!enabled || !before || !after || canUseLocalIrm)
      return []
    return [
      {
        address: market.irmAddress as `0x${string}`,
        abi: IRM_BORROW_RATE_VIEW_ABI,
        functionName: 'borrowRateView',
        args: [marketParams, before] as const,
      },
      {
        address: market.irmAddress as `0x${string}`,
        abi: IRM_BORROW_RATE_VIEW_ABI,
        functionName: 'borrowRateView',
        args: [marketParams, after] as const,
      },
    ] as const
  }, [enabled, before, after, market.irmAddress, marketParams])

  const { data: borrowRates, isLoading: isBorrowRateLoading, error: borrowRateError } = useReadContracts({
    contracts: contracts as any,
    allowFailure: true,
    query: { enabled },
  })

  const borrowRateBefore = (localBorrowRateBefore
    ?? (borrowRates?.[0]?.status === 'success' ? borrowRates[0].result : undefined)) as bigint | undefined
  const borrowRateAfter = (localBorrowRateAfter
    ?? (borrowRates?.[1]?.status === 'success' ? borrowRates[1].result : undefined)) as bigint | undefined

  const feeWad = marketState?.fee

  const supplyApyBefore = useMemo(() => {
    if (borrowRateBefore == null || utilizationBeforeWad == null || feeWad == null)
      return undefined
    const rate = supplyRatePerSecondWad({ borrowRatePerSecondWad: borrowRateBefore, utilizationWad: utilizationBeforeWad, feeWad })
    return displayApyFromRatePerSecondWad(rate)
  }, [borrowRateBefore, utilizationBeforeWad, feeWad])

  const supplyApyAfter = useMemo(() => {
    if (borrowRateAfter == null || utilizationAfterWad == null || feeWad == null)
      return undefined
    const rate = supplyRatePerSecondWad({ borrowRatePerSecondWad: borrowRateAfter, utilizationWad: utilizationAfterWad, feeWad })
    return displayApyFromRatePerSecondWad(rate)
  }, [borrowRateAfter, utilizationAfterWad, feeWad])

  const utilizationBefore = useMemo(() => {
    if (utilizationBeforeWad == null)
      return undefined
    return Number.parseFloat(formatUnits(utilizationBeforeWad, 18))
  }, [utilizationBeforeWad])

  const utilizationAfter = useMemo(() => {
    if (utilizationAfterWad == null)
      return undefined
    return Number.parseFloat(formatUnits(utilizationAfterWad, 18))
  }, [utilizationAfterWad])

  const canEstimateApy = utilizationBefore != null && utilizationAfter != null && market.state.supplyApy != null
  const estimatedSupplyApyAfter = useMemo(() => {
    if (!canEstimateApy)
      return undefined
    if (utilizationBefore <= 0)
      return market.state.supplyApy
    // Simple “utilization-only” estimate: assumes borrow rate unchanged.
    return market.state.supplyApy * (utilizationAfter / utilizationBefore)
  }, [canEstimateApy, utilizationBefore, utilizationAfter, market.state.supplyApy])

  return {
    enabled,
    isBorrowRateLoading,
    borrowRateError,
    rateAtTargetApy,
    utilizationBefore,
    utilizationAfter,
    supplyApyBefore,
    supplyApyAfter,
    estimatedSupplyApyAfter,
  }
}
