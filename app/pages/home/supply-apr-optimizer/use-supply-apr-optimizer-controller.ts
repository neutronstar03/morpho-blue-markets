import type { AutoStepInfo, LoanAssetOption, OptimizerMarketMeta } from './shared'
import type { MarketAprBySymbolMap } from '~/lib/default-market-apr'
import type { SupplyOptimizerDebugRequest } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import type { OptimizeSupplyWithPositionsResult, UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import type { OptimizerStrategy } from '~/lib/optimizer/supply-optimizer-runner'
import type { SupplyOptimizerWorkerResponse } from '~/lib/optimizer/supply-optimizer-worker-types'
import type { OptimizerReadResult } from '~/lib/optimizer/use-supply-optimizer-reads'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useChainId, usePublicClient, useReadContracts } from 'wagmi'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { trackEvent } from '~/lib/analytics'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { useSupplyAprOptimizer } from '~/lib/contexts/optimizer.context'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import {
  DEFAULT_MARKET_APR,
  getDefaultMarketAprByAssetSymbol,
  normalizeMarketAprAssetSymbol,
  resolveMarketAprByAssetSymbol,
  setMarketAprBySymbolWithGroup,
} from '~/lib/default-market-apr'
import { useMarketsByChain } from '~/lib/hooks/graphql/use-markets-by-chain'
import { usePopularLoanAssetsByChain } from '~/lib/hooks/graphql/use-popular-loan-assets-by-chain'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount, useTokenBalance } from '~/lib/hooks/rpc/use-morpho'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'
import { ZERO_ADDRESS } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { dumpSupplyOptimizerFixtures, setSupplyOptimizerDebugState } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import { buildMoveSizeCacheKey, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import SupplyOptimizerWorker from '~/lib/optimizer/supply-optimizer.worker?worker'
import { useSupplyOptimizerReads } from '~/lib/optimizer/use-supply-optimizer-reads'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'

// Orchestrates the supply optimizer end-to-end: asset selection, live/onchain reads, worker runs, cached auto-step heuristics, result shaping, and preset/debug wiring.

const REWARD_APR_WAD_SCALE = 1_000_000_000_000n

// Split 1e18 into 1e12 * 1e6 so Math.round works on an integer-scale intermediate,
// avoiding the floating-point precision loss of BigInt(Math.round(value * 1e18)).
function decimalAprToWad(value?: number | null): bigint {
  if (value == null || !Number.isFinite(value) || value <= 0)
    return 0n
  return BigInt(Math.round(value * Number(REWARD_APR_WAD_SCALE))) * (10n ** 6n)
}

function sumSupplyRewardAprWad(rewards?: Array<{ supplyApr?: number | null }> | null): bigint {
  if (!rewards?.length)
    return 0n
  return rewards.reduce((sum, reward) => sum + decimalAprToWad(reward.supplyApr), 0n)
}

export function useSupplyAprOptimizerController() {
  const MAX_OPTIMIZER_ITERATIONS = 1000
  const OPTIMIZER_READ_CHUNK_SIZE = 50
  const OPTIMIZER_READ_CACHE_TTL_MS = 60_000
  const MIN_CANDIDATE_NET_SUPPLY_APY = 0.01
  const MAX_CANDIDATE_NET_SUPPLY_APY = 6
  const MIN_CANDIDATE_BORROW_USD = 5
  const ctx = useSupplyAprOptimizer()
  const { address: userAddress, chain } = useAccount()
  const walletChainId = useChainId()
  const { viewingAddress, isViewingWallet } = useViewingWallet()
  const effectiveUserAddress = viewingAddress ?? userAddress
  const effectiveChainId = chain?.id ?? walletChainId
  const newDepositAmount = ctx.inputs.newDepositAmount
  const setDerived = ctx.setDerived
  const setNewDepositAmount = ctx.setNewDepositAmount
  const beginRun = ctx.beginRun
  const cancelRun = ctx.cancelRun
  const finishRun = ctx.finishRun

  const heuristicCacheRef = useRef(new Map<string, { stepAssets: bigint }>())
  const optimizerWorkerRef = useRef<Worker | null>(null)
  const [autoStepInfo, setAutoStepInfo] = useState<AutoStepInfo | null>(null)
  const [runProgressLabel, setRunProgressLabel] = useState<string | null>(null)
  const [runProgressPercent, setRunProgressPercent] = useState<number | null>(null)
  const lastOptimizerRequestRef = useRef<SupplyOptimizerDebugRequest | null>(null)
  const lastOptimizerReadRef = useRef<OptimizerReadResult | null>(null)

  const [maxMarketsInput, setMaxMarketsInput] = useLocalStorage<string>('supply-apr-optimizer:max-markets', '5')
  const [marketAprBySymbol, setMarketAprBySymbol] = useLocalStorage<MarketAprBySymbolMap>('supply-apr-optimizer:market-apr-by-symbol', {})
  const [strategyInput, setStrategyInput] = useLocalStorage<OptimizerStrategy>('supply-apr-optimizer:strategy', 'maxYield')
  const [skipThreshold] = useLocalStorage<string>('supply-apr-optimizer:skip-threshold', '0.25')
  const noBenefitDeltaAprWad = useMemo(() => {
    const raw = skipThreshold?.trim()
    if (!raw)
      return 2_500_000_000_000_000n
    const parsed = parseTokenAmount(raw, 16)
    return parsed >= 0n ? parsed : 2_500_000_000_000_000n
  }, [skipThreshold])
  const optimizerPreset = useHomeMagicOptimizerStore(state => state.optimizerPreset)
  const consumeOptimizerPreset = useHomeMagicOptimizerStore(state => state.consumeOptimizerPreset)
  const consumeFreshPrecomputedResult = useHomeMagicOptimizerStore(state => state.consumeFreshPrecomputedResult)

  const { data: livePositions, isLoading: isLoadingPositions } = useLiveMarketPositions({ address: effectiveUserAddress, chainId: effectiveChainId })

  const ownedLoanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    const map = new Map<string, LoanAssetOption>()
    for (const p of (livePositions ?? [])) {
      if (!hasVisibleSuppliedAssets({
        userSupplyShares: p.userState.supplyShares,
        totalSupplyAssets: p.market.state.supplyAssets,
        totalSupplyShares: p.market.state.supplyShares,
      })) {
        continue
      }
      const addr = p.market.loanAsset.address.toLowerCase()
      const symbol = p.market.loanAsset.symbol
      const decimals = p.market.loanAsset.decimals ?? 18
      if (!map.has(addr))
        map.set(addr, { address: p.market.loanAsset.address, symbol, decimals })
    }
    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [livePositions])

  const { data: popularLoanAssets } = usePopularLoanAssetsByChain(effectiveChainId, {
    enabled: !!effectiveUserAddress && !!effectiveChainId,
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
        priceUsd: a.priceUsd,
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
  const fallbackLabel = 'Withdraw to wallet'

  const selectedUserMarketsAll = useMemo(() => {
    if (!selectedLoanAddr)
      return []
    return (livePositions ?? []).filter(p => hasVisibleSuppliedAssets({
      userSupplyShares: p.userState.supplyShares,
      totalSupplyAssets: p.market.state.supplyAssets,
      totalSupplyShares: p.market.state.supplyShares,
    }) && p.market.loanAsset.address.toLowerCase() === selectedLoanAddr)
  }, [livePositions, selectedLoanAddr])

  const decisionsVersion = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  const selectedUserMarkets = useMemo(() => {
    // These version hooks exist only to invalidate this memo when risk lists change, even though getMarketRisk reads the backing state directly.
    void decisionsVersion
    void whitelistVersion
    void blacklistVersion
    if (!effectiveChainId)
      return selectedUserMarketsAll
    return selectedUserMarketsAll.filter((p) => {
      const status = getMarketRisk({
        chainId: effectiveChainId,
        uniqueKey: p.market.uniqueKey,
        loanAssetAddress: p.market.loanAsset.address,
        collateralAssetAddress: p.market.collateralAsset.address,
        loanAssetSymbol: p.market.loanAsset.symbol,
        collateralAssetSymbol: p.market.collateralAsset.symbol,
        warnings: p.market.warnings,
      }).status
      return status !== 'black'
    })
  }, [blacklistVersion, decisionsVersion, effectiveChainId, selectedUserMarketsAll, whitelistVersion])

  const userSupplySharesByMarketId = useMemo(() => {
    const map = new Map<string, bigint>()
    for (const p of selectedUserMarkets)
      map.set(p.market.uniqueKey.toLowerCase(), p.userState.supplyShares)
    return map
  }, [selectedUserMarkets])

  const topMarketsQuery = useMarketsByChain(selectedLoanAddr ? effectiveChainId : undefined, selectedLoanAddr, {
    minNetSupplyApy: MIN_CANDIDATE_NET_SUPPLY_APY,
    maxNetSupplyApy: MAX_CANDIDATE_NET_SUPPLY_APY,
    minBorrowUsd: MIN_CANDIDATE_BORROW_USD,
  })
  const topMarkets = topMarketsQuery.data

  const { data: walletBalanceRaw } = useTokenBalance(selectedOption?.address ?? ZERO_ADDRESS, selectedOption ? effectiveUserAddress : undefined)

  const morphoAddress = useMemo(() => getMorphoBlueAddress(effectiveChainId), [effectiveChainId])
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
      positions.push({ marketId: selectedUserMarkets[i].market.uniqueKey as `0x${string}`, suppliedAssets })
      total += suppliedAssets
    }

    setDerived({ totalSuppliedAssets: total, positions })
  }, [selectedOption, selectedUserMarkets, setDerived, userMarketStates])

  useEffect(() => {
    if (!selectedOption)
      return
    if (newDepositAmount != null)
      return
    const bal = walletBalanceRaw ?? 0n
    if (bal > 0n) {
      setNewDepositAmount(formatUnits(bal, selectedOption.decimals))
      return
    }
    const priceUsd = selectedOption.priceUsd
    if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0)
      return
    const targetUsd = 100_000
    const tokenAmt = targetUsd / priceUsd
    const s = trimTrailingZerosDecimalString(tokenAmt.toFixed(Math.min(6, selectedOption.decimals)))
    if (s)
      setNewDepositAmount(s)
  }, [newDepositAmount, selectedOption, setNewDepositAmount, walletBalanceRaw])

  useEffect(() => {
    if (!selectedOption)
      return
    const nextMarketApr = resolveMarketAprByAssetSymbol(selectedOption.symbol, marketAprBySymbol)
    if ((ctx.inputs.marketApr ?? '') === nextMarketApr)
      return
    ctx.setMarketApr(nextMarketApr)
  }, [ctx, marketAprBySymbol, selectedOption])

  useEffect(() => {
    if (ctx.inputs.strategy !== strategyInput)
      ctx.setStrategy(strategyInput)
  }, [ctx, strategyInput])

  const onChangeStrategy = useCallback((value: OptimizerStrategy) => {
    ctx.setStrategy(value)
    setStrategyInput(value)
  }, [ctx, setStrategyInput])

  const [optimizeRequest, setOptimizeRequest] = useState<null | {
    runId: number
    timestamp: bigint
    stepAssets?: bigint
    newDepositAssets: bigint
    fallbackAprWad: bigint
    maxMarketsUsed: number
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}`, rewardSupplyAprWad?: bigint }>
    autoStep: boolean
    autoCacheKey?: string
    strategy: OptimizerStrategy
  }>(null)

  const stopOptimizerWorker = useCallback(() => {
    if (optimizerWorkerRef.current) {
      optimizerWorkerRef.current.terminate()
      optimizerWorkerRef.current = null
    }
  }, [])

  const onCancelOptimize = useCallback(() => {
    if (!ctx.run.isRunning)
      return
    trackEvent('optimizer_run_canceled', { loanAsset: selectedOption?.symbol, chainId: effectiveChainId })
    stopOptimizerWorker()
    setOptimizeRequest(null)
    setRunProgressLabel(null)
    setRunProgressPercent(null)
    cancelRun(ctx.run.runId)
  }, [cancelRun, ctx.run.isRunning, ctx.run.runId, effectiveChainId, selectedOption?.symbol, stopOptimizerWorker])

  const lastNonNullChainIdRef = useRef<number | undefined>(effectiveChainId)
  useEffect(() => {
    const currentChainId = effectiveChainId
    if (currentChainId == null)
      return
    const previousNonNull = lastNonNullChainIdRef.current
    lastNonNullChainIdRef.current = currentChainId
    if (previousNonNull == null || previousNonNull === currentChainId)
      return
    // The worker, derived positions, and cached move heuristics are chain-specific, so reset everything before the next run starts on the new chain.
    stopOptimizerWorker()
    ctx.clear()
    setOptimizeRequest(null)
    setAutoStepInfo(null)
    setRunProgressLabel(null)
    setRunProgressPercent(null)
    heuristicCacheRef.current.clear()
  }, [effectiveChainId, ctx, stopOptimizerWorker])

  useEffect(() => () => stopOptimizerWorker(), [stopOptimizerWorker])

  const publicClient = usePublicClient()
  const optimizeReadResult = useSupplyOptimizerReads({
    input: optimizeRequest,
    morphoAddress,
    chainId: effectiveChainId,
    publicClient,
    config: {
      chunkSize: OPTIMIZER_READ_CHUNK_SIZE,
      cacheTtlMs: OPTIMIZER_READ_CACHE_TTL_MS,
    },
  })

  useEffect(() => {
    if (!optimizeRequest || !optimizeReadResult)
      return
    const { snapshots, skippedMarkets, missingRequired } = optimizeReadResult
    lastOptimizerReadRef.current = optimizeReadResult
    if (import.meta.env.DEV)
      setSupplyOptimizerDebugState({ readResult: optimizeReadResult })
    if (skippedMarkets > 0)
      console.warn(`Optimizer skipped ${skippedMarkets} markets due to missing onchain reads.`)
    if (missingRequired.length > 0) {
      finishRun(optimizeRequest.runId, undefined, `Missing onchain data for ${missingRequired.length} of your markets; cannot optimize.`)
      setOptimizeRequest(null)
      setRunProgressLabel(null)
      setRunProgressPercent(null)
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

      stopOptimizerWorker()
      const worker = new SupplyOptimizerWorker()
      optimizerWorkerRef.current = worker

      const handleDone = (runResult: Extract<SupplyOptimizerWorkerResponse, { type: 'done' }>['result']) => {
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

        if (runResult.status !== 'success' || !runResult.result) {
          finishRun(optimizeRequest.runId, undefined, runResult.error ?? 'Optimizer failed')
          return
        }
        if (runResult.result.iterations >= MAX_OPTIMIZER_ITERATIONS) {
          finishRun(optimizeRequest.runId, undefined, 'Optimizer stopped early (maximum iterations reached). Try narrowing the market set and retrying.')
          return
        }
        finishRun(optimizeRequest.runId, runResult.result, undefined)
      }

      worker.onmessage = (event: MessageEvent<SupplyOptimizerWorkerResponse>) => {
        const message = event.data
        if (!message || message.runId !== optimizeRequest.runId)
          return
        if (message.type === 'progress') {
          setRunProgressLabel(message.progress.label)
          setRunProgressPercent(message.progress.percent ?? null)
          return
        }
        if (message.type === 'error') {
          finishRun(optimizeRequest.runId, undefined, message.error)
          setOptimizeRequest(null)
          setRunProgressLabel(null)
          setRunProgressPercent(null)
          stopOptimizerWorker()
          return
        }
        handleDone(message.result)
        setOptimizeRequest(null)
        setRunProgressLabel(null)
        setRunProgressPercent(null)
        stopOptimizerWorker()
      }

      worker.onerror = () => {
        finishRun(optimizeRequest.runId, undefined, 'Optimizer worker failed')
        setOptimizeRequest(null)
        setRunProgressLabel(null)
        setRunProgressPercent(null)
        stopOptimizerWorker()
      }

      worker.postMessage({
        type: 'run',
        runId: optimizeRequest.runId,
        args: {
          markets: snapshots,
          positions: optimizeRequest.positions,
          newDepositAssets: optimizeRequest.newDepositAssets,
          timestamp: optimizeRequest.timestamp,
          constraints: {
            maxMarketsUsed: optimizeRequest.maxMarketsUsed,
            minSupplyAprWad: optimizeRequest.fallbackAprWad,
            fallbackAprWad: optimizeRequest.fallbackAprWad,
            fallbackLabel,
          },
          maxIterations: MAX_OPTIMIZER_ITERATIONS,
          stepAssets,
          auto: optimizeRequest.autoStep,
          strategy: optimizeRequest.strategy,
        },
      })
    }
    catch (e: any) {
      finishRun(optimizeRequest.runId, undefined, e?.message ?? 'Optimizer failed')
      setOptimizeRequest(null)
      setRunProgressLabel(null)
      setRunProgressPercent(null)
      stopOptimizerWorker()
    }
  }, [fallbackLabel, finishRun, optimizeReadResult, optimizeRequest, stopOptimizerWorker])

  const onChangeLoanAsset = useCallback((addr: string) => {
    const opt = loanAssetOptions.find(o => o.address === addr)
    ctx.setSelection({
      chainId: effectiveChainId,
      loanAssetAddress: addr,
      loanAssetSymbol: opt?.symbol,
      loanAssetDecimals: opt?.decimals,
    })
    ctx.setMarketApr(resolveMarketAprByAssetSymbol(opt?.symbol, marketAprBySymbol))
    ctx.setNewDepositAmount(undefined)
  }, [ctx, effectiveChainId, loanAssetOptions, marketAprBySymbol])

  const onChangeMarketApr = useCallback((value: string) => {
    ctx.setMarketApr(value)
    const normalizedSymbol = normalizeMarketAprAssetSymbol(selectedOption?.symbol ?? ctx.selection.loanAssetSymbol)
    if (!normalizedSymbol)
      return
    setMarketAprBySymbol((prev) => {
      const next = setMarketAprBySymbolWithGroup(normalizedSymbol, value, prev)
      return next === prev ? prev : next
    })
  }, [ctx, selectedOption?.symbol, setMarketAprBySymbol])

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
    && !!effectiveUserAddress
    && !!effectiveChainId

  const parseMaxMarkets = useCallback((value: string) => {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }, [])

  const onFillMaxDeposit = useCallback(() => {
    if (!selectedOption)
      return
    ctx.setNewDepositAmount(formatUnits(walletBalanceRaw ?? 0n, selectedOption.decimals))
  }, [ctx, selectedOption, walletBalanceRaw])

  const onFillZeroDeposit = useCallback(() => {
    ctx.setNewDepositAmount('0')
  }, [ctx])

  // Run sequence: validate inputs, freeze timestamp/run id, build the risk-filtered market universe, reuse any cached step heuristic, then kick off reads for the worker.
  const onOptimize = useCallback(() => {
    if (!selectedOption || !effectiveUserAddress || !effectiveChainId)
      return
    if (topMarketsQuery.isLoading || topMarketsQuery.isFetching)
      return
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
    setRunProgressLabel('Loading data')
    setRunProgressPercent(null)

    const marketAprRaw = (ctx.inputs.marketApr ?? DEFAULT_MARKET_APR).trim()
    const fallbackAprWad = parseTokenAmount(marketAprRaw, 16)
    if (fallbackAprWad < 0n) {
      finishRun(runId, undefined, 'Market APR must be >= 0')
      setRunProgressLabel(null)
      setRunProgressPercent(null)
      return
    }

    let stepAssets: bigint | undefined
    const maxMarketsUsed = Number.parseInt((maxMarketsInput ?? '').trim(), 10)
    if (!Number.isFinite(maxMarketsUsed) || maxMarketsUsed < 1) {
      finishRun(runId, undefined, 'Max markets must be >= 1')
      setRunProgressLabel(null)
      setRunProgressPercent(null)
      return
    }

    const newDepositAssets = parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)
    if (positions.length === 0 && newDepositAssets <= 0n) {
      finishRun(runId, undefined, 'Deposit amount must be > 0')
      setRunProgressLabel(null)
      setRunProgressPercent(null)
      return
    }

    const strategy = strategyInput
    trackEvent('optimizer_run_started', { loanAsset: selectedOption.symbol, chainId: effectiveChainId, maxMarkets: maxMarketsUsed })

    const cacheKey = buildMoveSizeCacheKey({
      chainId: effectiveChainId,
      loanAssetAddress: selectedOption.address,
      newDepositAssets,
      fallbackAprWad,
      maxMarketsUsed,
      positions,
      strategy,
    })

    const cached = heuristicCacheRef.current.get(cacheKey)
    if (cached)
      stepAssets = cached.stepAssets

    const universe = new Map<string, { uniqueKey: `0x${string}`, irmAddress: `0x${string}`, rewardSupplyAprWad?: bigint }>()
    for (const m of (topMarkets ?? [])) {
      const id = m.uniqueKey.toLowerCase()
      const status = effectiveChainId
        ? getMarketRisk({
          chainId: effectiveChainId,
          uniqueKey: m.uniqueKey,
          loanAssetAddress: m.loanAsset?.address,
          collateralAssetAddress: m.collateralAsset?.address,
          loanAssetSymbol: m.loanAsset?.symbol,
          collateralAssetSymbol: m.collateralAsset?.symbol,
          warnings: m.warnings,
        }).status
        : undefined
      if (status === 'black')
        continue
      const rewardSupplyAprWad = sumSupplyRewardAprWad(m.state?.rewards)
      universe.set(id, { uniqueKey: m.uniqueKey as `0x${string}`, irmAddress: m.irmAddress as `0x${string}`, rewardSupplyAprWad })
    }
    for (const p of selectedUserMarkets) {
      const id = p.market.uniqueKey.toLowerCase()
      const status = effectiveChainId
        ? getMarketRisk({
          chainId: effectiveChainId,
          uniqueKey: p.market.uniqueKey,
          loanAssetAddress: p.market.loanAsset?.address,
          collateralAssetAddress: p.market.collateralAsset?.address,
          loanAssetSymbol: p.market.loanAsset?.symbol,
          collateralAssetSymbol: p.market.collateralAsset?.symbol,
          warnings: p.market.warnings,
        }).status
        : undefined
      if (status === 'black')
        continue
      const rewardSupplyAprWad = sumSupplyRewardAprWad(p.market.state?.rewards)
      universe.set(id, { uniqueKey: p.market.uniqueKey as `0x${string}`, irmAddress: p.market.irmAddress as `0x${string}`, rewardSupplyAprWad })
    }

    const requestPayload = {
      runId,
      timestamp,
      stepAssets,
      newDepositAssets,
      fallbackAprWad,
      maxMarketsUsed,
      positions,
      markets: [...universe.values()],
      autoStep: true,
      autoCacheKey: cacheKey,
      strategy,
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
  }, [beginRun, ctx, effectiveChainId, effectiveUserAddress, finishRun, maxMarketsInput, selectedOption, selectedUserMarkets, strategyInput, topMarkets, topMarketsQuery])

  const result = ctx.result
  const parsedNewDepositAssets = useMemo(() => {
    if (!selectedOption)
      return 0n
    return parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)
  }, [selectedOption, ctx.inputs.newDepositAmount])
  const displayResult = useMemo<OptimizeSupplyWithPositionsResult | undefined>(() => {
    if (ctx.run.error || !result)
      return undefined
    if (parsedNewDepositAssets > 0n)
      return result
    const aprGainWad = result.optimized.blendedAprWad - result.current.blendedAprWad
    if (aprGainWad > noBenefitDeltaAprWad)
      return result
    // With no fresh deposit, hide tiny APR-only reallocations by collapsing back to the current allocation so the UI does not suggest busywork.
    return {
      ...result,
      optimized: { ...result.current },
      positions: result.positions.map(p => ({ ...p, amountAssets: p.currentUserAssets, deltaAssets: 0n })),
    }
  }, [ctx.run.error, noBenefitDeltaAprWad, parsedNewDepositAssets, result])

  const totalAllocatedAssets = useMemo(() => displayResult ? displayResult.positions.reduce((sum, p) => sum + p.amountAssets, 0n) : 0n, [displayResult])
  const symbol = selectedOption?.symbol ?? ctx.selection.loanAssetSymbol ?? ''
  const chainIdForLinks = ctx.selection.chainId ?? effectiveChainId
  const chainNameForLinks = chainIdForLinks ? getSupportedChainName(chainIdForLinks) : undefined

  const marketMetaById = useMemo<Map<string, OptimizerMarketMeta>>(() => {
    const map = new Map<string, OptimizerMarketMeta>()
    for (const m of (topMarkets ?? [])) {
      map.set(m.uniqueKey.toLowerCase(), {
        collateralSymbol: m.collateralAsset?.symbol,
        status: effectiveChainId
          ? getMarketRisk({
            chainId: effectiveChainId,
            uniqueKey: m.uniqueKey,
            loanAssetAddress: m.loanAsset?.address,
            collateralAssetAddress: m.collateralAsset?.address,
            loanAssetSymbol: m.loanAsset?.symbol,
            collateralAssetSymbol: m.collateralAsset?.symbol,
            warnings: m.warnings,
          }).status
          : undefined,
      })
    }
    for (const p of selectedUserMarkets) {
      map.set(p.market.uniqueKey.toLowerCase(), {
        collateralSymbol: p.market.collateralAsset?.symbol,
        status: effectiveChainId
          ? getMarketRisk({
            chainId: effectiveChainId,
            uniqueKey: p.market.uniqueKey,
            loanAssetAddress: p.market.loanAsset?.address,
            collateralAssetAddress: p.market.collateralAsset?.address,
            loanAssetSymbol: p.market.loanAsset?.symbol,
            collateralAssetSymbol: p.market.collateralAsset?.symbol,
            warnings: p.market.warnings,
          }).status
          : undefined,
      })
    }
    return map
  }, [effectiveChainId, selectedUserMarkets, topMarkets])

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
    setSupplyOptimizerDebugState({
      request: lastOptimizerRequestRef.current ?? pendingRequest ?? undefined,
      readResult: lastOptimizerReadRef.current ?? optimizeReadResult ?? undefined,
      result,
      displayResult,
      marketMetaById,
      loanToken: { symbol: selectedOption?.symbol ?? ctx.selection.loanAssetSymbol, decimals: selectedOption?.decimals },
    })
  }, [ctx.selection.loanAssetSymbol, displayResult, marketMetaById, optimizeReadResult, optimizeRequest, result, selectedOption])

  useEffect(() => {
    if (import.meta.env.PROD || typeof window === 'undefined') {
      return
    }

    const win = window as any
    win.dumpSupplyOptimizerFixtures = dumpSupplyOptimizerFixtures
    return () => {
      if (win.dumpSupplyOptimizerFixtures === dumpSupplyOptimizerFixtures)
        delete win.dumpSupplyOptimizerFixtures
    }
  }, [])

  useEffect(() => {
    if (!optimizerPreset || !effectiveChainId || optimizerPreset.chainId !== effectiveChainId)
      return

    // Reuse a still-fresh precomputed result when possible so clicking an opportunity card can open the optimizer with an answer instead of forcing a rerun.
    const precomputedResult = optimizerPreset.usePrecomputedIfFresh && effectiveUserAddress
      ? consumeFreshPrecomputedResult({
          chainId: optimizerPreset.chainId,
          userAddress: effectiveUserAddress,
          loanAssetAddress: optimizerPreset.loanAssetAddress,
          maxMarketsUsed: optimizerPreset.maxMarketsUsed,
          marketApr: optimizerPreset.marketApr ?? DEFAULT_MARKET_APR,
          newDepositAmount: optimizerPreset.newDepositAmount,
        })
      : undefined

    ctx.setSelection({
      chainId: optimizerPreset.chainId,
      loanAssetAddress: optimizerPreset.loanAssetAddress,
      loanAssetSymbol: optimizerPreset.loanAssetSymbol,
      loanAssetDecimals: optimizerPreset.loanAssetDecimals,
    })
    ctx.setMarketApr(optimizerPreset.marketApr ?? DEFAULT_MARKET_APR)
    ctx.setNewDepositAmount(optimizerPreset.newDepositAmount)
    setMaxMarketsInput(String(optimizerPreset.maxMarketsUsed))

    if (precomputedResult)
      ctx.applyPrefetchedResult(precomputedResult)

    consumeOptimizerPreset()
  }, [consumeFreshPrecomputedResult, consumeOptimizerPreset, ctx, effectiveChainId, effectiveUserAddress, optimizerPreset, setMaxMarketsInput])

  const hasSomethingToClear = !!ctx.selection.loanAssetAddress || ctx.inputs.newDepositAmount != null || !!ctx.result || !!ctx.run.error || ctx.run.isRunning
  const optimizeLabel = topMarketsQuery.isLoading || topMarketsQuery.isFetching
    ? 'Loading markets...'
    : ctx.run.isRunning
      ? `${runProgressLabel ?? 'Optimizing'}${runProgressPercent != null ? ` ${runProgressPercent}%` : ''}`
      : 'Optimize'

  return {
    ctx,
    userAddress: effectiveUserAddress,
    isViewingWallet,
    chain,
    isLoadingPositions,
    ownedLoanAssetOptions,
    popularLoanAssetOptions,
    loanAssetOptions,
    selectedOption,
    symbol,
    walletBalanceRaw,
    maxMarketsInput,
    setMaxMarketsInput,
    strategyInput,
    onChangeStrategy,
    onChangeLoanAsset,
    onChangeMarketApr,
    onFillMaxDeposit,
    onFillZeroDeposit,
    onOptimize,
    onCancelOptimize,
    canOptimize,
    optimizeLabel,
    topMarketsQuery,
    displayResult,
    marketMetaById,
    chainIdForLinks,
    chainNameForLinks,
    autoStepInfo,
    totalAllocatedAssets,
    morphoAddress,
    userSupplySharesByMarketId,
    hasSomethingToClear,
    parseMaxMarkets,
    getDefaultMarketAprByAssetSymbol,
  }
}
