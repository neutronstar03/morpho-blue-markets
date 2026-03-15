import type { SupplyOptimizerDebugRequest } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import type { OptimizeSupplyWithPositionsResult, UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import type { SupplyOptimizerWorkerResponse } from '~/lib/optimizer/supply-optimizer-worker-types'
import type { OptimizerReadResult } from '~/lib/optimizer/use-supply-optimizer-reads'
import type { AutoStepInfo, LoanAssetOption, OptimizerMarketMeta } from '~/pages/home/supply-apr-optimizer/shared'
import { Coins, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, usePublicClient, useReadContracts } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { useSupplyAprOptimizer } from '~/lib/contexts/optimizer.context'
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
import { dumpSupplyOptimizerFixtures, setSupplyOptimizerDebugState } from '~/lib/optimizer/supply-apr-optimizer-debugger'
import { buildMoveSizeCacheKey, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import SupplyOptimizerWorker from '~/lib/optimizer/supply-optimizer.worker?worker'
import { useSupplyOptimizerReads } from '~/lib/optimizer/use-supply-optimizer-reads'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { SupplyAprOptimizerForm } from '~/pages/home/supply-apr-optimizer/optimizer-form'
import { SupplyAprOptimizerResults } from '~/pages/home/supply-apr-optimizer/optimizer-results'

export function SupplyAprOptimizer() {
  // If the blended APR improvement is <= this threshold, show a "no-op" plan.
  // 0.25% = 0.0025 in WAD terms (1e18 = 100%).
  const NO_BENEFIT_DELTA_APR_WAD = 2_500_000_000_000_000n
  const MAX_OPTIMIZER_ITERATIONS = 1000
  const OPTIMIZER_READ_CHUNK_SIZE = 50
  const OPTIMIZER_READ_CACHE_TTL_MS = 60_000
  const MIN_CANDIDATE_NET_SUPPLY_APY = 0.01
  const MAX_CANDIDATE_NET_SUPPLY_APY = 6
  const MIN_CANDIDATE_BORROW_USD = 5
  const DEFAULT_MARKET_APR = '10'

  const ctx = useSupplyAprOptimizer()
  const { address: userAddress, chain } = useAccount()
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

  const [maxMarketsInput, setMaxMarketsInput] = useLocalStorage<string>(
    'supply-apr-optimizer:max-markets',
    '5',
  )
  const optimizerPreset = useHomeMagicOptimizerStore(state => state.optimizerPreset)
  const consumeOptimizerPreset = useHomeMagicOptimizerStore(state => state.consumeOptimizerPreset)
  const consumeFreshPrecomputedResult = useHomeMagicOptimizerStore(state => state.consumeFreshPrecomputedResult)

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

  const selectedUserMarketsAll = useMemo(() => {
    if (!selectedLoanAddr)
      return []
    return (livePositions ?? []).filter((p) => {
      return p.userState.supplyShares > 0n
        && p.market.loanAsset.address.toLowerCase() === selectedLoanAddr
    })
  }, [livePositions, selectedLoanAddr])

  const decisionsVersion = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  const selectedUserMarkets = useMemo(() => {
    void decisionsVersion
    void whitelistVersion
    void blacklistVersion
    if (!chain?.id)
      return selectedUserMarketsAll
    return selectedUserMarketsAll.filter((p) => {
      const status = getMarketRisk({
        chainId: chain.id,
        uniqueKey: p.market.uniqueKey,
        loanAssetAddress: p.market.loanAsset.address,
        collateralAssetAddress: p.market.collateralAsset.address,
        loanAssetSymbol: p.market.loanAsset.symbol,
        collateralAssetSymbol: p.market.collateralAsset.symbol,
        warnings: p.market.warnings,
      }).status
      return status !== 'black'
    })
  }, [blacklistVersion, chain?.id, decisionsVersion, selectedUserMarketsAll, whitelistVersion])

  const userSupplySharesByMarketId = useMemo(() => {
    const map = new Map<string, bigint>()
    for (const p of selectedUserMarkets) {
      map.set(p.market.uniqueKey.toLowerCase(), p.userState.supplyShares)
    }
    return map
  }, [selectedUserMarkets])

  // Fetch top candidate markets (max 200) for the selected loan asset on this chain.
  const topMarketsQuery = useMarketsByChain(
    selectedLoanAddr ? chain?.id : undefined,
    selectedLoanAddr,
    {
      minNetSupplyApy: MIN_CANDIDATE_NET_SUPPLY_APY,
      maxNetSupplyApy: MAX_CANDIDATE_NET_SUPPLY_APY,
      minBorrowUsd: MIN_CANDIDATE_BORROW_USD,
    },
  )
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
    fallbackAprWad: bigint
    maxMarketsUsed: number
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
    autoStep: boolean
    autoCacheKey?: string
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
    stopOptimizerWorker()
    setOptimizeRequest(null)
    setRunProgressLabel(null)
    setRunProgressPercent(null)
    cancelRun(ctx.run.runId)
  }, [cancelRun, ctx.run.isRunning, ctx.run.runId, stopOptimizerWorker])

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

    stopOptimizerWorker()
    ctx.clear()
    setOptimizeRequest(null)
    setAutoStepInfo(null)
    setRunProgressLabel(null)
    setRunProgressPercent(null)
    heuristicCacheRef.current.clear()
  }, [chain?.id, ctx, stopOptimizerWorker])

  useEffect(() => {
    return () => {
      stopOptimizerWorker()
    }
  }, [stopOptimizerWorker])

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
          finishRun(
            optimizeRequest.runId,
            undefined,
            runResult.error ?? 'Optimizer failed',
          )
          return
        }

        if (runResult.result.iterations >= MAX_OPTIMIZER_ITERATIONS) {
          finishRun(
            optimizeRequest.runId,
            undefined,
            'Optimizer stopped early (maximum iterations reached). Try narrowing the market set and retrying.',
          )
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
            fallbackLabel: 'Withdraw to wallet',
          },
          maxIterations: MAX_OPTIMIZER_ITERATIONS,
          stepAssets,
          auto: optimizeRequest.autoStep,
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
  }, [finishRun, optimizeReadResult, optimizeRequest, stopOptimizerWorker])

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
    && !!userAddress
    && !!chain?.id

  const parseMaxMarkets = (value: string) => {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }

  const onFillMaxDeposit = useCallback(() => {
    if (!selectedOption)
      return
    ctx.setNewDepositAmount(formatUnits(walletBalanceRaw ?? 0n, selectedOption.decimals))
  }, [ctx, selectedOption, walletBalanceRaw])

  const onFillZeroDeposit = useCallback(() => {
    ctx.setNewDepositAmount('0')
  }, [ctx])

  const onOptimize = () => {
    if (!selectedOption || !userAddress || !chain?.id)
      return

    if (topMarketsQuery.isLoading || topMarketsQuery.isFetching) {
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

    const cacheKey = buildMoveSizeCacheKey({
      chainId: chain?.id,
      loanAssetAddress: selectedOption.address,
      newDepositAssets,
      fallbackAprWad,
      maxMarketsUsed,
      positions,
    })

    const cached = heuristicCacheRef.current.get(cacheKey)
    if (cached)
      stepAssets = cached.stepAssets

    // Universe = top markets (<= 200) ∪ user's markets (for safety).
    const universe = new Map<string, { uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>()

    for (const m of (topMarkets ?? [])) {
      const id = m.uniqueKey.toLowerCase()
      const status = chain?.id
        ? getMarketRisk({
          chainId: chain.id,
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
      universe.set(id, { uniqueKey: m.uniqueKey as `0x${string}`, irmAddress: m.irmAddress as `0x${string}` })
    }
    for (const p of selectedUserMarkets) {
      const id = p.market.uniqueKey.toLowerCase()
      const status = chain?.id
        ? getMarketRisk({
          chainId: chain.id,
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
      universe.set(id, { uniqueKey: p.market.uniqueKey as `0x${string}`, irmAddress: p.market.irmAddress as `0x${string}` })
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
  const displayResult = useMemo<OptimizeSupplyWithPositionsResult | undefined>(() => {
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

  const marketMetaById = useMemo<Map<string, OptimizerMarketMeta>>(() => {
    const map = new Map<string, OptimizerMarketMeta>()
    for (const m of (topMarkets ?? [])) {
      map.set(m.uniqueKey.toLowerCase(), {
        collateralSymbol: m.collateralAsset?.symbol,
        status: chain?.id
          ? getMarketRisk({
            chainId: chain.id,
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
        status: chain?.id
          ? getMarketRisk({
            chainId: chain.id,
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
  }, [chain?.id, topMarkets, selectedUserMarkets])

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

  useEffect(() => {
    if (!optimizerPreset)
      return
    if (!chain?.id || optimizerPreset.chainId !== chain.id)
      return

    const precomputedResult = optimizerPreset.usePrecomputedIfFresh && userAddress
      ? consumeFreshPrecomputedResult({
          chainId: optimizerPreset.chainId,
          userAddress,
          loanAssetAddress: optimizerPreset.loanAssetAddress,
          maxMarketsUsed: optimizerPreset.maxMarketsUsed,
          marketApr: optimizerPreset.marketApr ?? DEFAULT_MARKET_APR,
          newDepositAmount: optimizerPreset.newDepositAmount,
        })
      : undefined

    if (!ctx.started)
      ctx.start()

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
  }, [chain?.id, consumeFreshPrecomputedResult, consumeOptimizerPreset, ctx, optimizerPreset, setMaxMarketsInput, userAddress])

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
            onClick={ctx.run.isRunning ? onCancelOptimize : () => ctx.clear()}
            className={`ml-auto h-8 px-2.5 text-xs ${ctx.run.isRunning ? 'border-red-500/60 text-red-200 hover:bg-red-500/10 hover:text-red-100' : ''}`}
            title={ctx.run.isRunning ? 'Cancel' : 'Clear'}
          >
            <X className="h-3.5 w-3.5" />
            {ctx.run.isRunning ? 'Cancel' : 'Clear'}
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
              <SupplyAprOptimizerForm
                selectedLoanAssetAddress={ctx.selection.loanAssetAddress}
                onChangeLoanAsset={onChangeLoanAsset}
                ownedLoanAssetOptions={ownedLoanAssetOptions}
                popularLoanAssetOptions={popularLoanAssetOptions}
                loanAssetOptions={loanAssetOptions}
                selectedOption={selectedOption}
                totalSuppliedAssets={ctx.derived.totalSuppliedAssets ?? 0n}
                marketApr={ctx.inputs.marketApr}
                onChangeMarketApr={value => ctx.setMarketApr(value)}
                newDepositAmount={ctx.inputs.newDepositAmount}
                onChangeNewDepositAmount={value => ctx.setNewDepositAmount(value)}
                onFillMaxDeposit={onFillMaxDeposit}
                onFillZeroDeposit={onFillZeroDeposit}
                walletBalanceRaw={walletBalanceRaw}
                symbol={symbol}
                maxMarketsInput={maxMarketsInput ?? ''}
                setMaxMarketsInput={setMaxMarketsInput}
                parseMaxMarkets={parseMaxMarkets}
                onOptimize={onOptimize}
                optimizeDisabled={ctx.run.isRunning || !canOptimize || topMarketsQuery.isLoading || topMarketsQuery.isFetching}
                optimizeLoading={ctx.run.isRunning || topMarketsQuery.isLoading || topMarketsQuery.isFetching}
                optimizeLabel={topMarketsQuery.isLoading || topMarketsQuery.isFetching
                  ? 'Loading markets...'
                  : ctx.run.isRunning
                    ? `${runProgressLabel ?? 'Optimizing'}${runProgressPercent != null ? ` ${runProgressPercent}%` : ''}`
                    : 'Optimize'}
              />
            )}

            {ctx.run.error && (
              <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                {ctx.run.error}
              </div>
            )}

            {displayResult && selectedOption && (
              <SupplyAprOptimizerResults
                displayResult={displayResult}
                selectedOption={selectedOption}
                symbol={symbol}
                marketMetaById={marketMetaById}
                chainIdForLinks={chainIdForLinks}
                chainNameForLinks={chainNameForLinks}
                autoStepInfo={autoStepInfo}
                totalAllocatedAssets={totalAllocatedAssets}
                userAddress={userAddress as `0x${string}` | undefined}
                chainId={chain?.id}
                morphoAddress={morphoAddress as `0x${string}` | undefined}
                userSupplySharesByMarketId={userSupplySharesByMarketId}
              />
            )}
          </>
        )}
      </div>
    </Card>
  )
}
