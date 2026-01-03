import type { SingleMorphoMarket } from '../graphql/use-market'
import { useMemo } from 'react'
import { encodeAbiParameters, formatUnits, keccak256 } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { useNetworkContext } from '~/lib/contexts/network'
import { adaptiveCurveBorrowRateView } from '~/lib/irm/adaptive-curve-irm'

const WAD = 1_000_000_000_000_000_000n
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

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

// Minimal ABI for AdaptiveCurveIRM-style rateAtTarget(bytes32 id) -> int256
const IRM_RATE_AT_TARGET_ABI = [
  {
    type: 'function',
    name: 'rateAtTarget',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [{ name: '', type: 'int256' }],
  },
] as const

export interface MorphoMarketStateTuple {
  totalSupplyAssets: bigint
  totalSupplyShares: bigint
  totalBorrowAssets: bigint
  totalBorrowShares: bigint
  lastUpdate: bigint
  fee: bigint
}

function normalizeMarketStateTuple(x: any): MorphoMarketStateTuple | undefined {
  if (!x)
    return undefined
  if (Array.isArray(x) && x.length >= 6) {
    return {
      totalSupplyAssets: x[0] as bigint,
      totalSupplyShares: x[1] as bigint,
      totalBorrowAssets: x[2] as bigint,
      totalBorrowShares: x[3] as bigint,
      lastUpdate: x[4] as bigint,
      fee: x[5] as bigint,
    }
  }
  // wagmi/viem may return named props
  return x as MorphoMarketStateTuple
}

function wadDivDown(n: bigint, d: bigint): bigint {
  if (d === 0n)
    return 0n
  return (n * WAD) / d
}

function clamp0ToWad(x: bigint): bigint {
  if (x < 0n)
    return 0n
  if (x > WAD)
    return WAD
  return x
}

function apyFromRatePerSecondWad(ratePerSecondWad: bigint): number {
  // Convert WAD to float per-second.
  const r = Number.parseFloat(formatUnits(ratePerSecondWad, 18))
  if (!Number.isFinite(r) || r <= 0)
    return 0
  // Continuous-compounding style APY (stable for small r via expm1).
  return Math.expm1(r * Number(SECONDS_PER_YEAR))
}

function supplyRatePerSecondWad(args: {
  borrowRatePerSecondWad: bigint
  utilizationWad: bigint
  feeWad: bigint
}): bigint {
  const { borrowRatePerSecondWad, utilizationWad } = args
  const feeWad = clamp0ToWad(args.feeWad)
  // supplyRate = borrowRate * utilization * (1 - fee)
  const afterUtil = (borrowRatePerSecondWad * utilizationWad) / WAD
  return (afterUtil * (WAD - feeWad)) / WAD
}

export function useMarketPreview(args: {
  market: SingleMorphoMarket
  marketStateRaw: unknown | undefined
  deltaSupplyAssets: bigint // + for supply, - for withdraw (raw loan token units)
}) {
  const { market, marketStateRaw, deltaSupplyAssets } = args
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  const marketState = useMemo(() => normalizeMarketStateTuple(marketStateRaw), [marketStateRaw])

  const marketParams = useMemo(() => {
    return {
      loanToken: market.loanAsset.address as `0x${string}`,
      collateralToken: market.collateralAsset.address as `0x${string}`,
      oracle: market.oracleAddress as `0x${string}`,
      irm: market.irmAddress as `0x${string}`,
      lltv: BigInt(market.lltv),
    } as const
  }, [market])

  // Morpho's market id = keccak256(abi.encode(marketParams)).
  const marketId = useMemo(() => {
    return keccak256(
      encodeAbiParameters(
        [
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'address' },
          { type: 'uint256' },
        ],
        [
          marketParams.loanToken,
          marketParams.collateralToken,
          marketParams.oracle,
          marketParams.irm,
          marketParams.lltv,
        ],
      ),
    ) as `0x${string}`
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
    return apyFromRatePerSecondWad(rate)
  }, [borrowRateBefore, utilizationBeforeWad, feeWad])

  const supplyApyAfter = useMemo(() => {
    if (borrowRateAfter == null || utilizationAfterWad == null || feeWad == null)
      return undefined
    const rate = supplyRatePerSecondWad({ borrowRatePerSecondWad: borrowRateAfter, utilizationWad: utilizationAfterWad, feeWad })
    return apyFromRatePerSecondWad(rate)
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

  const canEstimateApy = utilizationBefore != null && utilizationAfter != null && market.state.netSupplyApy != null
  const estimatedSupplyApyAfter = useMemo(() => {
    if (!canEstimateApy)
      return undefined
    if (utilizationBefore <= 0)
      return market.state.netSupplyApy
    // Simple “utilization-only” estimate: assumes borrow rate unchanged.
    return market.state.netSupplyApy * (utilizationAfter / utilizationBefore)
  }, [canEstimateApy, utilizationBefore, utilizationAfter, market.state.netSupplyApy])

  return {
    enabled,
    isBorrowRateLoading,
    borrowRateError,
    utilizationBefore,
    utilizationAfter,
    supplyApyBefore,
    supplyApyAfter,
    estimatedSupplyApyAfter,
  }
}
