import type { SupplyOptimizerDebugRequest } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import type { UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import type { OptimizerReadResult } from '~/lib/optimizer/use-supply-optimizer-reads'
import { Coins, Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createSearchParams, Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { useSupplyAprOptimizer } from '~/lib/contexts/optimizer.context'
import { formatBigintShort } from '~/lib/formatters'
import { useMarketsByChain } from '~/lib/hooks/graphql/use-markets-by-chain'
import { usePopularLoanAssetsByChain } from '~/lib/hooks/graphql/use-popular-loan-assets-by-chain'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount, useTokenBalance } from '~/lib/hooks/rpc/use-morpho'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { ZERO_ADDRESS } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { dumpSupplyOptimizerFixtures, setSupplyOptimizerDebugState } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import { runSupplyOptimizer } from '~/lib/optimizer/supply-optimizer-runner'
import { buildMoveSizeCacheKey, fmtToken, pctFromWad, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import { useSupplyOptimizerReads } from '~/lib/optimizer/use-supply-optimizer-reads'
import { BundleOptimizerResult } from '~/pages/home/bundle-optimizer-result'

interface LoanAssetOption {
  address: string
  symbol: string
  decimals: number
  oraclePriceUsd?: number | null
}

interface AutoStepInfo {
  stepAssets: bigint
  stepRatioWad: bigint
  attempts: number
  fromCache: boolean
}

export function SupplyAprOptimizer() {
  const WAD = 10n ** 18n
  // If the blended APR improvement is <= this threshold, show a "no-op" plan.
  // 0.25% = 0.0025 in WAD terms (1e18 = 100%).
  const NO_BENEFIT_DELTA_APR_WAD = 2_500_000_000_000_000n
  const MAX_OPTIMIZER_ITERATIONS = 1000
  const OPTIMIZER_READ_CHUNK_SIZE = 50
  const OPTIMIZER_READ_CACHE_TTL_MS = 60_000

  const ctx = useSupplyAprOptimizer()
  const { address: userAddress, chain } = useAccount()
  const newDepositAmount = ctx.inputs.newDepositAmount
  const setDerived = ctx.setDerived
  const setNewDepositAmount = ctx.setNewDepositAmount
  const beginRun = ctx.beginRun
  const finishRun = ctx.finishRun

  const heuristicCacheRef = useRef(new Map<string, { stepAssets: bigint }>())
  const [autoStepInfo, setAutoStepInfo] = useState<AutoStepInfo | null>(null)
  const lastOptimizerRequestRef = useRef<SupplyOptimizerDebugRequest | null>(null)
  const lastOptimizerReadRef = useRef<OptimizerReadResult | null>(null)

  const [maxMarketsInput, setMaxMarketsInput] = useLocalStorage<string>(
    'supply-apr-optimizer:max-markets',
    '5',
  )

  const {
    data: livePositions,
    isLoading: isLoadingPositions,
  } = useLiveMarketPositions()

  const ownedLoanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    const map = new Map<string, LoanAssetOption>()
    for (const p of (livePositions ?? [])) {
      if (p.userState.supplyShares <= 0n)
        continue
      const addr = p.market.loanAsset.address.toLowerCase()
      const symbol = p.market.loanAsset.symbol
      const decimals = p.market.loanAsset.decimals ?? 18
      if (!map.has(addr)) {
        map.set(addr, { address: p.market.loanAsset.address, symbol, decimals })
      }
    }
    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [livePositions])

  const { data: popularLoanAssets } = usePopularLoanAssetsByChain(chain?.id, {
    enabled: ctx.started,
    topN: 20,
    first: 200,
    minNetSupplyApy: 0.05,
    maxNetSupplyApy: 6,
    minBorrowUsd: 20_000,
    minUtilization: 0.1,
  })

  const popularLoanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    return (popularLoanAssets ?? [])
      .map(a => ({
        address: a.address,
        symbol: a.symbol,
        decimals: a.decimals ?? 18,
        oraclePriceUsd: a.oraclePriceUsd,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [popularLoanAssets])

  const loanAssetOptions = useMemo(() => {
    const byAddr = new Map<string, LoanAssetOption>()
    for (const o of ownedLoanAssetOptions)
      byAddr.set(o.address.toLowerCase(), o)
    for (const o of popularLoanAssetOptions) {
      const key = o.address.toLowerCase()
      if (!byAddr.has(key))
        byAddr.set(key, o)
    }
    return [...byAddr.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [ownedLoanAssetOptions, popularLoanAssetOptions])

  const selectedLoanAddr = ctx.selection.loanAssetAddress?.toLowerCase()

  const selectedOption = useMemo(() => {
    if (!selectedLoanAddr)
      return undefined
    return loanAssetOptions.find(o => o.address.toLowerCase() === selectedLoanAddr)
  }, [loanAssetOptions, selectedLoanAddr])

  const selectedUserMarkets = useMemo(() => {
    if (!selectedLoanAddr)
      return []
    return (livePositions ?? []).filter((p) => {
      return p.userState.supplyShares > 0n
        && p.market.loanAsset.address.toLowerCase() === selectedLoanAddr
    })
  }, [livePositions, selectedLoanAddr])

  const userSupplySharesByMarketId = useMemo(() => {
    const map = new Map<string, bigint>()
    for (const p of selectedUserMarkets) {
      map.set(p.market.uniqueKey.toLowerCase(), p.userState.supplyShares)
    }
    return map
  }, [selectedUserMarkets])

  // Fetch top candidate markets (max 200) for the selected loan asset on this chain.
  const topMarketsQuery = useMarketsByChain(selectedLoanAddr ? chain?.id : undefined, selectedLoanAddr)
  const topMarkets = topMarketsQuery.data

  const { data: walletBalanceRaw } = useTokenBalance(
    selectedOption?.address ?? ZERO_ADDRESS,
    selectedOption ? userAddress : undefined,
  )

  // Small onchain read for user markets to compute supplied assets and default step.
  const morphoAddress = useMemo(() => getMorphoBlueAddress(chain?.id), [chain?.id])
  const userMarketStateContracts = useMemo(() => {
    if (!selectedOption || selectedUserMarkets.length === 0)
      return []
    return selectedUserMarkets.map(m => ({
      address: morphoAddress,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'market' as const,
      args: [m.market.uniqueKey as `0x${string}`] as const,
    }))
  }, [selectedOption, selectedUserMarkets, morphoAddress])

  const { data: userMarketStates } = useReadContracts({
    contracts: userMarketStateContracts as any,
    allowFailure: true,
    query: {
      enabled: !!selectedOption && selectedUserMarkets.length > 0,
      staleTime: 30 * 1000,
    },
  })

  // Derive UserSupplyPosition[] and total supplied, then set default min move size (1%).
  useEffect(() => {
    if (!selectedOption)
      return
    if (!userMarketStates || userMarketStates.length !== selectedUserMarkets.length)
      return

    const positions: UserSupplyPosition[] = []
    let total = 0n

    for (let i = 0; i < selectedUserMarkets.length; i++) {
      const res = userMarketStates[i]
      if (res?.status !== 'success' || !res.result)
        continue
      const st = normalizeMorphoMarketState(res.result)
      if (!st)
        continue
      const totalSupplyAssets = st.totalSupplyAssets
      const totalSupplyShares = st.totalSupplyShares
      const supplyShares = selectedUserMarkets[i].userState.supplyShares
      if (totalSupplyShares <= 0n || totalSupplyAssets <= 0n || supplyShares <= 0n)
        continue
      const suppliedAssets = (supplyShares * totalSupplyAssets) / totalSupplyShares
      if (suppliedAssets <= 0n)
        continue
      positions.push({
        marketId: selectedUserMarkets[i].market.uniqueKey as `0x${string}`,
        suppliedAssets,
      })
      total += suppliedAssets
    }

    setDerived({ totalSuppliedAssets: total, positions })
  }, [selectedOption, selectedUserMarkets, setDerived, userMarketStates])

  // Default "additional amount to supply" to the user's wallet balance for the selected token.
  // Only set a default if the user hasn't typed anything yet.
  useEffect(() => {
    if (!selectedOption)
      return
    if (newDepositAmount != null)
      return
    const bal = walletBalanceRaw ?? 0n
    if (bal > 0n) {
      // Prefill with a parseable string (no locale commas).
      setNewDepositAmount(formatUnits(bal, selectedOption.decimals))
      return
    }

    const priceUsd = selectedOption.oraclePriceUsd
    if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0)
      return

    const targetUsd = 100_000
    const tokenAmt = targetUsd / priceUsd
    const s = trimTrailingZerosDecimalString(tokenAmt.toFixed(Math.min(6, selectedOption.decimals)))
    if (s)
      setNewDepositAmount(s)
  }, [newDepositAmount, selectedOption, setNewDepositAmount, walletBalanceRaw])

  const [optimizeRequest, setOptimizeRequest] = useState<null | {
    runId: number
    timestamp: bigint
    stepAssets?: bigint
    newDepositAssets: bigint
    maxMarketsUsed: number
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
    autoStep: boolean
    autoCacheKey?: string
  }>(null)

  // Note: some wallets transiently report `chainId = undefined` during network switching.
  // Track the last *non-null* chain id to ensure we still clear state on real chain changes.
  const lastNonNullChainIdRef = useRef<number | undefined>(chain?.id)

  useEffect(() => {
    const currentChainId = chain?.id
    if (currentChainId == null)
      return

    const previousNonNull = lastNonNullChainIdRef.current
    lastNonNullChainIdRef.current = currentChainId

    if (previousNonNull == null)
      return
    if (previousNonNull === currentChainId)
      return

    ctx.clear()
    setOptimizeRequest(null)
    setAutoStepInfo(null)
    heuristicCacheRef.current.clear()
  }, [chain?.id, ctx])

  const publicClient = usePublicClient()
  const optimizeReadResult = useSupplyOptimizerReads({
    input: optimizeRequest,
    morphoAddress,
    chainId: chain?.id,
    publicClient,
    config: {
      chunkSize: OPTIMIZER_READ_CHUNK_SIZE,
      cacheTtlMs: OPTIMIZER_READ_CACHE_TTL_MS,
    },
  })

  // When onchain snapshot is ready, run optimizer.
  useEffect(() => {
    if (!optimizeRequest)
      return
    if (!optimizeReadResult)
      return

    const { snapshots, skippedMarkets, missingRequired } = optimizeReadResult
    lastOptimizerReadRef.current = optimizeReadResult
    if (import.meta.env.DEV)
      setSupplyOptimizerDebugState({ readResult: optimizeReadResult })

    if (skippedMarkets > 0) {
      console.warn(`Optimizer skipped ${skippedMarkets} markets due to missing onchain reads.`)
    }

    if (missingRequired.length > 0) {
      finishRun(optimizeRequest.runId, undefined, `Missing onchain data for ${missingRequired.length} of your markets; cannot optimize.`)
      setOptimizeRequest(null)
      return
    }

    try {
      const cacheKey = optimizeRequest.autoCacheKey
      let stepAssets = optimizeRequest.stepAssets
      let usedCachedStep = false

      if (optimizeRequest.autoStep && stepAssets == null && cacheKey) {
        const cached = heuristicCacheRef.current.get(cacheKey)
        if (cached) {
          stepAssets = cached.stepAssets
          usedCachedStep = true
        }
      }

      const runResult = runSupplyOptimizer({
        markets: snapshots,
        positions: optimizeRequest.positions,
        newDepositAssets: optimizeRequest.newDepositAssets,
        timestamp: optimizeRequest.timestamp,
        constraints: {
          maxMarketsUsed: optimizeRequest.maxMarketsUsed,
        },
        maxIterations: MAX_OPTIMIZER_ITERATIONS,
        stepAssets,
        auto: optimizeRequest.autoStep,
      })

      if (runResult.status !== 'success' || !runResult.result) {
        finishRun(
          optimizeRequest.runId,
          undefined,
          runResult.error ?? 'Optimizer failed',
        )
        setOptimizeRequest(null)
        return
      }

      if (optimizeRequest.autoStep) {
        if (runResult.autoInfo) {
          setAutoStepInfo({
            stepAssets: runResult.autoInfo.stepAssets,
            stepRatioWad: runResult.autoInfo.stepRatioWad,
            attempts: runResult.autoInfo.attempts,
            fromCache: usedCachedStep && !runResult.autoInfo.fromHeuristic,
          })
        }
        if (cacheKey && runResult.stepAssets != null && (!usedCachedStep || runResult.autoInfo?.fromHeuristic))
          heuristicCacheRef.current.set(cacheKey, { stepAssets: runResult.stepAssets })
      }
      else {
        setAutoStepInfo(null)
      }

      if (runResult.result.iterations >= MAX_OPTIMIZER_ITERATIONS) {
        finishRun(
          optimizeRequest.runId,
          undefined,
          'Optimizer stopped early (maximum iterations reached). Try increasing “Minimum move size”.',
        )
      }
      else {
        finishRun(optimizeRequest.runId, runResult.result, undefined)
      }
    }
    catch (e: any) {
      finishRun(optimizeRequest.runId, undefined, e?.message ?? 'Optimizer failed')
    }
    finally {
      setOptimizeRequest(null)
    }
  }, [finishRun, optimizeReadResult, optimizeRequest])

  const canStart = !isLoadingPositions
  const canPick = ctx.started && loanAssetOptions.length > 0

  const onStart = () => ctx.start()

  const onChangeLoanAsset = (addr: string) => {
    const opt = loanAssetOptions.find(o => o.address === addr)
    ctx.setSelection({
      chainId: chain?.id,
      loanAssetAddress: addr,
      loanAssetSymbol: opt?.symbol,
      loanAssetDecimals: opt?.decimals,
    })
    // Mark as "unset" so Auto applies for the new selection.
    ctx.setMinMoveSize(undefined)
    ctx.setNewDepositAmount(undefined)
  }

  // Parsed deposit amount used to enable deposit-only optimization when no positions exist.
  const parsedDepositAssetsForGate = useMemo(() => {
    if (!selectedOption)
      return 0n
    return parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)
  }, [selectedOption, ctx.inputs.newDepositAmount])

  const canOptimize = !!selectedOption
    && ((ctx.derived.positions?.length ?? 0) > 0 || parsedDepositAssetsForGate > 0n)
    && (() => {
      const parsed = Number.parseInt((maxMarketsInput ?? '').trim(), 10)
      return Number.isFinite(parsed) && parsed >= 1
    })()
    && !ctx.run.isRunning
    && !!userAddress
    && !!chain?.id

  const parseMaxMarkets = (value: string) => {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }

  const onOptimize = () => {
    if (!selectedOption || !userAddress || !chain?.id)
      return

    // Avoid silently running with an incomplete market universe.
    // If `topMarkets` isn't ready, show an explicit message instead of a dead "Optimize" button.
    if (topMarketsQuery.isLoading || topMarketsQuery.isFetching) {
      const timestamp = BigInt(Math.floor(Date.now() / 1000))
      const runId = beginRun({ timestamp })
      finishRun(runId, undefined, 'Loading top markets… please retry in a moment.')
      return
    }
    if (topMarketsQuery.isError) {
      const timestamp = BigInt(Math.floor(Date.now() / 1000))
      const runId = beginRun({ timestamp })
      finishRun(runId, undefined, 'Failed to load top markets. Please retry.')
      return
    }
    if (!topMarkets || topMarkets.length === 0) {
      const timestamp = BigInt(Math.floor(Date.now() / 1000))
      const runId = beginRun({ timestamp })
      finishRun(runId, undefined, 'No markets found for this asset on this chain.')
      return
    }
    const positions = ctx.derived.positions ?? []

    const timestamp = BigInt(Math.floor(Date.now() / 1000))
    const runId = beginRun({ timestamp })

    setAutoStepInfo(null)

    const minMoveSizeRaw = (ctx.inputs.minMoveSize ?? '').trim()
    const useAutoMoveSize = minMoveSizeRaw.length === 0
    let stepAssets: bigint | undefined

    if (!useAutoMoveSize) {
      stepAssets = parseTokenAmount(minMoveSizeRaw, selectedOption.decimals)
      if (stepAssets <= 0n) {
        finishRun(runId, undefined, 'Minimum move size must be > 0')
        return
      }
    }

    const maxMarketsUsed = Number.parseInt((maxMarketsInput ?? '').trim(), 10)
    if (!Number.isFinite(maxMarketsUsed) || maxMarketsUsed < 1) {
      finishRun(runId, undefined, 'Max markets must be >= 1')
      return
    }

    const newDepositAssets = parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)
    if (positions.length === 0 && newDepositAssets <= 0n) {
      finishRun(runId, undefined, 'Deposit amount must be > 0')
      return
    }

    const cacheKey = buildMoveSizeCacheKey({
      chainId: chain?.id,
      loanAssetAddress: selectedOption.address,
      newDepositAssets,
      maxMarketsUsed,
      positions,
    })

    if (useAutoMoveSize) {
      const cached = heuristicCacheRef.current.get(cacheKey)
      if (cached)
        stepAssets = cached.stepAssets
    }

    // Universe = top markets (<= 200) ∪ user's markets (for safety).
    const universe = new Map<string, { uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>()

    for (const m of (topMarkets ?? [])) {
      const id = m.uniqueKey.toLowerCase()
      universe.set(id, { uniqueKey: m.uniqueKey as `0x${string}`, irmAddress: m.irmAddress as `0x${string}` })
    }
    for (const p of selectedUserMarkets) {
      const id = p.market.uniqueKey.toLowerCase()
      universe.set(id, { uniqueKey: p.market.uniqueKey as `0x${string}`, irmAddress: p.market.irmAddress as `0x${string}` })
    }

    const requestPayload = {
      runId,
      timestamp,
      stepAssets,
      newDepositAssets,
      maxMarketsUsed,
      positions,
      markets: [...universe.values()],
      autoStep: useAutoMoveSize,
      autoCacheKey: useAutoMoveSize ? cacheKey : undefined,
    }

    const debugRequest: SupplyOptimizerDebugRequest = {
      runId,
      timestamp,
      stepAssets,
      newDepositAssets,
      maxMarketsUsed,
      positions,
      markets: requestPayload.markets,
    }
    lastOptimizerRequestRef.current = debugRequest
    if (import.meta.env.DEV)
      setSupplyOptimizerDebugState({ request: debugRequest })

    setOptimizeRequest(requestPayload)
  }

  const result = ctx.result
  const parsedNewDepositAssets = useMemo(() => {
    if (!selectedOption)
      return 0n
    return parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)
  }, [selectedOption, ctx.inputs.newDepositAmount])
  const displayResult = useMemo(() => {
    if (ctx.run.error)
      return undefined
    if (!result)
      return undefined
    // The "no-op plan" is only meaningful for rebalance-only runs.
    if (parsedNewDepositAssets > 0n)
      return result
    const aprGainWad = result.optimized.blendedAprWad - result.current.blendedAprWad
    const noBenefit = aprGainWad <= NO_BENEFIT_DELTA_APR_WAD
    if (!noBenefit)
      return result

    return {
      ...result,
      optimized: { ...result.current },
      positions: result.positions.map(p => ({
        ...p,
        amountAssets: p.currentUserAssets,
        deltaAssets: 0n,
      })),
    }
  }, [NO_BENEFIT_DELTA_APR_WAD, ctx.run.error, parsedNewDepositAssets, result])

  const totalAllocatedAssets = useMemo(() => {
    if (!displayResult)
      return 0n
    return displayResult.positions.reduce((sum, p) => sum + p.amountAssets, 0n)
  }, [displayResult])
  const symbol = selectedOption?.symbol ?? ctx.selection.loanAssetSymbol ?? ''
  const chainIdForLinks = ctx.selection.chainId ?? chain?.id
  const chainNameForLinks = chainIdForLinks ? getSupportedChainName(chainIdForLinks) : undefined

  const marketMetaById = useMemo(() => {
    const map = new Map<string, { collateralSymbol?: string }>()
    for (const m of (topMarkets ?? [])) {
      map.set(m.uniqueKey.toLowerCase(), { collateralSymbol: m.collateralAsset?.symbol })
    }
    for (const p of selectedUserMarkets) {
      map.set(p.market.uniqueKey.toLowerCase(), { collateralSymbol: p.market.collateralAsset?.symbol })
    }
    return map
  }, [topMarkets, selectedUserMarkets])

  useEffect(() => {
    if (import.meta.env.PROD)
      return

    const pendingRequest = optimizeRequest
      ? {
          runId: optimizeRequest.runId,
          timestamp: optimizeRequest.timestamp,
          stepAssets: optimizeRequest.stepAssets,
          newDepositAssets: optimizeRequest.newDepositAssets,
          maxMarketsUsed: optimizeRequest.maxMarketsUsed,
          positions: optimizeRequest.positions,
          markets: optimizeRequest.markets,
        }
      : undefined

    const payload: Parameters<typeof setSupplyOptimizerDebugState>[0] = {
      request: lastOptimizerRequestRef.current ?? pendingRequest ?? undefined,
      readResult: lastOptimizerReadRef.current ?? optimizeReadResult ?? undefined,
      result,
      displayResult,
      marketMetaById,
      loanToken: {
        symbol: selectedOption?.symbol ?? ctx.selection.loanAssetSymbol,
        decimals: selectedOption?.decimals,
      },
    }

    setSupplyOptimizerDebugState(payload)
  }, [
    ctx.selection.loanAssetSymbol,
    displayResult,
    marketMetaById,
    optimizeReadResult,
    optimizeRequest,
    result,
    selectedOption,
  ])

  useEffect(() => {
    if (import.meta.env.PROD)
      return
    if (typeof window === 'undefined') {
      return
    }
    ;(window as any).dumpSupplyOptimizerFixtures = dumpSupplyOptimizerFixtures

    return () => {
      if ((window as any).dumpSupplyOptimizerFixtures === dumpSupplyOptimizerFixtures) {
        delete (window as any).dumpSupplyOptimizerFixtures
      }
    }
  }, [])

  return (
    <Card className="mb-8" data-testid="supply-apr-optimizer-card">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">Supply APR optimizer</h2>
          <p className="text-sm text-gray-400">
            Suggests how to rebalance your existing supply to improve APR.
          </p>
        </div>
        {ctx.started && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ctx.clear()}
            className="ml-auto h-8 px-2.5 text-xs"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {!ctx.started && (
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-gray-300">
              Pick a supplied token and compute an optimized rebalance plan.
            </div>
            <Button onClick={onStart} disabled={!canStart} isLoading={isLoadingPositions}>
              Start
            </Button>
          </div>
        )}

        {ctx.started && (
          <>
            {loanAssetOptions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                  <Coins className="w-5 h-5 text-gray-500" />
                </div>
                <p className="text-gray-300 font-medium mb-1">No supply positions detected</p>
                <p className="text-sm text-gray-500">You need to have active supply positions to use the optimizer.</p>
              </div>
            )}

            {canPick && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 md:gap-4 items-start" data-testid="supply-apr-optimizer-form">
                <div className="flex flex-col gap-1.5 md:gap-2">
                  <div className="h-5 flex items-center">
                    <Label>Asset to optimize</Label>
                  </div>
                  <Select
                    value={ctx.selection.loanAssetAddress ?? undefined}
                    onValueChange={onChangeLoanAsset}
                  >
                    <SelectTrigger className="w-full h-10 bg-gray-900 border-gray-700 text-white text-sm">
                      <SelectValue placeholder="Select an asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownedLoanAssetOptions.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Owned assets</SelectLabel>
                          {ownedLoanAssetOptions.map(o => (
                            <SelectItem key={o.address} value={o.address}>
                              {o.symbol}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {popularLoanAssetOptions.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Popular assets</SelectLabel>
                          {popularLoanAssetOptions
                            .filter(o => !ownedLoanAssetOptions.some(x => x.address.toLowerCase() === o.address.toLowerCase()))
                            .map(o => (
                              <SelectItem key={o.address} value={o.address}>
                                {o.symbol}
                              </SelectItem>
                            ))}
                        </SelectGroup>
                      )}
                      {ownedLoanAssetOptions.length === 0 && popularLoanAssetOptions.length === 0 && loanAssetOptions.map(o => (
                        <SelectItem key={o.address} value={o.address}>
                          {o.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-gray-500 min-h-0 md:h-4">
                    {selectedOption && (
                      <>
                        Your supplied:
                        {' '}
                        {fmtToken(ctx.derived.totalSuppliedAssets ?? 0n, selectedOption.decimals)}
                        {' '}
                        {selectedOption.symbol}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2">
                  <div className="h-5 flex items-center gap-2">
                    <Label>Minimum move size</Label>
                    <InfoTooltip
                      ariaLabel="Minimum move size info"
                      content={(
                        <span>
                          Leave blank for Auto (finds the smallest move size that converges).
                        </span>
                      )}
                    />
                  </div>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={ctx.inputs.minMoveSize ?? ''}
                      onChange={e => ctx.setMinMoveSize(e.target.value)}
                      placeholder="Auto"
                      className="w-full h-10 pr-16 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 pointer-events-none">
                      {symbol}
                    </span>
                  </div>
                  <div className="h-0 md:h-4" />
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2">
                  <div className="h-5 flex items-center">
                    <Label>Additional amount to supply</Label>
                  </div>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={ctx.inputs.newDepositAmount ?? ''}
                      onChange={e => ctx.setNewDepositAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full h-10 pr-16 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 pointer-events-none">
                      {symbol}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 min-h-0 md:h-4">
                    {selectedOption && (
                      <>
                        Wallet balance:
                        {' '}
                        {fmtToken(walletBalanceRaw ?? 0n, selectedOption.decimals)}
                        {' '}
                        {selectedOption.symbol}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2">
                  <div className="h-5 flex items-center gap-2">
                    <Label>Max markets</Label>
                    <InfoTooltip
                      ariaLabel="Max markets info"
                      content={(
                        <span>
                          Limits the number of markets used in the optimized allocation.
                        </span>
                      )}
                    />
                  </div>
                  <div className="grid h-10 w-full grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border border-gray-700 bg-gray-900">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-full rounded-none border-0 border-r border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
                      onClick={() => {
                        const current = parseMaxMarkets(maxMarketsInput ?? '')
                        if (current > 1)
                          setMaxMarketsInput(String(current - 1))
                      }}
                      disabled={parseMaxMarkets(maxMarketsInput ?? '') <= 1}
                      aria-label="Decrease max markets"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={maxMarketsInput ?? ''}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D+/g, '')
                        setMaxMarketsInput(digitsOnly)
                      }}
                      className="h-full rounded-none border-0 px-0 text-center tabular-nums text-white placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Max markets"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-full rounded-none border-0 border-l border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
                      onClick={() => {
                        const current = parseMaxMarkets(maxMarketsInput ?? '')
                        setMaxMarketsInput(String(current + 1))
                      }}
                      aria-label="Increase max markets"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-gray-500 leading-4">Use +/- or type a value (min 1)</div>
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2">
                  <div className="h-0 md:h-5" />
                  <Button
                    className="w-full h-10"
                    onClick={onOptimize}
                    disabled={!canOptimize}
                    isLoading={ctx.run.isRunning}
                  >
                    Optimize
                  </Button>
                  <div className="h-0 md:h-4" />
                </div>
              </div>
            )}

            {ctx.run.error && (
              <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                {ctx.run.error}
              </div>
            )}

            {displayResult && selectedOption && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                    <div className="text-xs text-gray-400">Current blended APR</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.current.blendedAprWad)}</div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                    <div className="text-xs text-gray-400">Optimized blended APR</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.optimized.blendedAprWad)}</div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                    <div className="text-xs text-gray-400">Iterations</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{displayResult.iterations}</div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-gray-700 rounded-md">
                  <table className="min-w-full divide-y divide-gray-700" data-testid="supply-apr-optimizer-result-table">
                    <thead className="bg-gray-800/40">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Current</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Delta</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">APR after</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Yearly return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-900/20">
                      {displayResult.positions.map((p) => {
                        const deltaSign = p.deltaAssets >= 0n ? '+' : ''
                        const meta = marketMetaById.get(p.marketId.toLowerCase())
                        const marketLabel = meta?.collateralSymbol ? `${meta.collateralSymbol} / ${symbol}` : `${p.marketId.slice(0, 10)}…${p.marketId.slice(-6)}`
                        const absDeltaAssets = p.deltaAssets < 0n ? -p.deltaAssets : p.deltaAssets
                        const deepLinkTab = p.deltaAssets < 0n ? 'withdraw' : 'deposit'
                        const deepLinkAmount = selectedOption
                          ? trimTrailingZerosDecimalString(formatUnits(absDeltaAssets, selectedOption.decimals))
                          : ''
                        const deepLinkSearch = absDeltaAssets > 0n && deepLinkAmount
                          ? createSearchParams({
                              tab: deepLinkTab,
                              unit: 'asset',
                              amount: deepLinkAmount,
                            }).toString()
                          : ''
                        const yearlyReturnAssets = (p.amountAssets * p.supplyAprAfterWad) / WAD

                        return (
                          <tr key={p.marketId}>
                            <td className="px-3 sm:px-4 py-2 text-sm text-white">
                              <div className="flex items-center gap-2">
                                {chainIdForLinks
                                  ? (
                                      <Link
                                        to={{
                                          pathname: `/market/${p.marketId}/${chainIdForLinks}`,
                                          search: deepLinkSearch ? `?${deepLinkSearch}` : '',
                                        }}
                                        className="hover:text-blue-400 transition-colors"
                                      >
                                        {marketLabel}
                                      </Link>
                                    )
                                  : (
                                      <span>{marketLabel}</span>
                                    )}
                                {chainNameForLinks && (
                                  <a
                                    href={morphoAppMarketUrl(chainNameForLinks, p.marketId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white hover:text-blue-400 transition-colors flex items-center"
                                    title="Open in Morpho official UI"
                                  >
                                    <LinkNewWindow className="w-5 h-5" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {fmtToken(p.currentUserAssets, selectedOption.decimals)}
                              {' '}
                              {symbol}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {fmtToken(p.amountAssets, selectedOption.decimals)}
                              {' '}
                              {symbol}
                            </td>
                            <td className={`px-3 sm:px-4 py-2 text-sm text-right tabular-nums ${p.deltaAssets >= 0n ? 'text-green-300' : 'text-orange-300'}`}>
                              {deltaSign}
                              {fmtToken(p.deltaAssets, selectedOption.decimals)}
                              {' '}
                              {symbol}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {pctFromWad(p.supplyAprAfterWad)}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {fmtToken(yearlyReturnAssets, selectedOption.decimals)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2">
                  <div className="flex flex-row items-center mx-4 gap-2">
                    {autoStepInfo && (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                        <span>Auto step</span>
                        <span className="text-sm text-white whitespace-nowrap">
                          {formatBigintShort(autoStepInfo.stepAssets, selectedOption.decimals)}
                          {' '}
                          {symbol}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          (
                          {pctFromWad(autoStepInfo.stepRatioWad)}
                          )
                        </span>
                        {autoStepInfo.attempts > 0 && (
                          <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap">
                            Auto step found in
                            {' '}
                            {autoStepInfo.attempts}
                            {' '}
                            tries
                          </span>
                        )}
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-1 sm:gap-2">
                      <p className="text-xs text-gray-400 whitespace-nowrap">Total allocated</p>
                      <p className="text-sm text-white whitespace-nowrap">
                        {formatBigintShort(totalAllocatedAssets, selectedOption.decimals)}
                        {' '}
                        {symbol}
                      </p>
                    </div>
                  </div>
                  {displayResult.unallocatedNewDepositAssets > 0n && (
                    <div
                      className="
                        flex flex-row justify-center items-center mx-4 mt-1
                        sm:justify-end
                        gap-1 sm:gap-2
                      "
                    >
                      <p className="text-xs text-gray-400 whitespace-nowrap">Unallocated deposit</p>
                      <p className="text-sm text-white whitespace-nowrap">
                        {formatBigintShort(displayResult.unallocatedNewDepositAssets, selectedOption.decimals)}
                        {' '}
                        {symbol}
                      </p>
                    </div>
                  )}
                </div>

                {displayResult && selectedOption && userAddress && chain?.id && (
                  <BundleOptimizerResult
                    displayResult={displayResult}
                    chainId={chain.id}
                    morphoAddress={morphoAddress}
                    userAddress={userAddress as `0x${string}`}
                    userSupplySharesByMarketId={userSupplySharesByMarketId}
                    loanToken={{
                      address: selectedOption.address as `0x${string}`,
                      symbol,
                      decimals: selectedOption.decimals,
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
