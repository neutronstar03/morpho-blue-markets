import type { MarketAprBySymbolMap } from '~/lib/default-market-apr'
import type { UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import type { SupplyOptimizerWorkerResponse } from '~/lib/optimizer/supply-optimizer-worker-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAccount, usePublicClient } from 'wagmi'
import { useCollateralWhitelistVersion } from '~/lib/collateral-whitelist'
import { getDefaultMarketAprByAssetSymbol, resolveMarketAprByAssetSymbol } from '~/lib/default-market-apr'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount } from '~/lib/hooks/rpc/use-morpho'
import { useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'
import { getMarketRisk } from '~/lib/market-risk/market-risk'
import { getMarketSupplyUsdWithFallback } from '~/lib/morpho/market-valuation'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import SupplyOptimizerWorker from '~/lib/optimizer/supply-optimizer.worker?worker'
import { useSupplyOptimizerReads } from '~/lib/optimizer/use-supply-optimizer-reads'
import { getHomeMagicLastRunMs, setHomeMagicLastRunMs } from '../stores/home-magic-last-run'
import { useHomeMagicOptimizerStore } from '../stores/home-magic-optimizer.store'
import { useMarketsByChain } from './graphql/use-markets-by-chain'
import { useLocalStorage } from './use-local-storage'

interface ScanAsset {
  address: string
  symbol: string
  decimals: number
}

const MAX_MARKETS_USED = 6
const MAX_OPTIMIZER_ITERATIONS = 1000
const OPTIMIZER_READ_CHUNK_SIZE = 50

// Timer model for home optimizer automation:
// - Every 1 minute, the heartbeat wakes up and asks: should I do things?
// - On each heartbeat, we also prune expired visible opportunities and cached precomputed results.
// - A full optimizer scan is throttled separately so we do not rerun it too often.
// - The optimizer read cache is shorter-lived and only exists to be kind to RPC providers.
const PERIODIC_RESCAN_CHECK_MS = 60_000
const SCAN_COOLDOWN_MS = 10 * 60 * 1000
const HOME_OPPORTUNITY_TTL_MS = 2 * 60 * 1000
const OPTIMIZER_READ_CACHE_TTL_MS = 30_000
const MIN_CANDIDATE_NET_SUPPLY_APY = 0.01
const MAX_CANDIDATE_NET_SUPPLY_APY = 6
const MIN_CANDIDATE_BORROW_USD = 5

export function useHomeMagicOptimizerScan() {
  const { isConnected, address: userAddress, chain } = useAccount()
  const publicClient = usePublicClient()
  const [marketAprBySymbol] = useLocalStorage<MarketAprBySymbolMap>('supply-apr-optimizer:market-apr-by-symbol', {})
  const [skipThreshold] = useLocalStorage<string>('supply-apr-optimizer:skip-threshold', '0.25')
  const noBenefitDeltaAprWad = useMemo(() => {
    const raw = skipThreshold?.trim()
    if (!raw)
      return 2_500_000_000_000_000n // default 0.25%
    const parsed = parseTokenAmount(raw, 16)
    return parsed >= 0n ? parsed : 2_500_000_000_000_000n
  }, [skipThreshold])
  const {
    data: livePositions,
    isLoading: isLoadingPositions,
  } = useLiveMarketPositions()

  const {
    disabled,
    isScanning,
    scanChainId,
    startScan,
    setScanProgress,
    finishScan,
    clearScan,
    addOpportunity,
    upsertPrecomputedResult,
    clearOpportunitiesForChain,
    pruneExpiredHomeMagicItems,
  } = useHomeMagicOptimizerStore()

  const [queue, setQueue] = useState<ScanAsset[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [rescanCheckTick, setRescanCheckTick] = useState(0)
  const [request, setRequest] = useState<null | {
    runId: number
    timestamp: bigint
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
  }>(null)

  const runIdRef = useRef(1)
  const queueLengthRef = useRef(0)
  const location = useLocation()
  const isHomeRoute = location.pathname === '/'

  const activeAsset = queue[queueIndex]
  const chainId = chain?.id
  const morphoAddress = useMemo(() => getMorphoBlueAddress(chainId), [chainId])

  const selectedUserMarkets = useMemo(() => {
    if (!activeAsset)
      return []

    const addr = activeAsset.address.toLowerCase()
    return (livePositions ?? []).filter(p => hasVisibleSuppliedAssets({
      userSupplyShares: p.userState.supplyShares,
      totalSupplyAssets: p.market.state.supplyAssets,
      totalSupplyShares: p.market.state.supplyShares,
    }) && p.market.loanAsset.address.toLowerCase() === addr)
  }, [activeAsset, livePositions])

  const decisionsVersion = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  const selectedUserMarketsSafe = useMemo(() => {
    void decisionsVersion
    void whitelistVersion
    void blacklistVersion
    if (!chainId)
      return selectedUserMarkets
    return selectedUserMarkets.filter((p) => {
      const status = getMarketRisk({
        chainId,
        uniqueKey: p.market.uniqueKey,
        loanAssetAddress: p.market.loanAsset.address,
        collateralAssetAddress: p.market.collateralAsset.address,
        loanAssetSymbol: p.market.loanAsset.symbol,
        collateralAssetSymbol: p.market.collateralAsset.symbol,
        warnings: p.market.warnings,
      }).status
      return status !== 'black'
    })
  }, [blacklistVersion, chainId, decisionsVersion, selectedUserMarkets, whitelistVersion])

  const positions = useMemo<UserSupplyPosition[]>(() => {
    const out: UserSupplyPosition[] = []

    for (const p of selectedUserMarketsSafe) {
      const marketSupplyAssets = BigInt(p.market.state.supplyAssets)
      const marketSupplyShares = BigInt(p.market.state.supplyShares)
      const userSupplyShares = BigInt(p.userState.supplyShares)
      if (marketSupplyShares <= 0n || marketSupplyAssets <= 0n || userSupplyShares <= 0n)
        continue

      const suppliedAssets = (userSupplyShares * marketSupplyAssets) / marketSupplyShares
      if (suppliedAssets <= 0n)
        continue

      out.push({
        marketId: p.market.uniqueKey as `0x${string}`,
        suppliedAssets,
      })
    }

    return out
  }, [selectedUserMarketsSafe])

  const selectedUserMarketsUsd = useMemo(() => {
    let totalPrincipalUsd = 0

    for (const p of selectedUserMarketsSafe) {
      const marketSupplyShares = BigInt(p.market.state.supplyShares)
      const userSupplyShares = BigInt(p.userState.supplyShares)
      const marketSupplyUsd = getMarketSupplyUsdWithFallback(p.market)

      if (marketSupplyShares <= 0n || userSupplyShares <= 0n || marketSupplyUsd == null)
        continue

      const shareRatio = Number(userSupplyShares) / Number(marketSupplyShares)
      if (!Number.isFinite(shareRatio) || shareRatio <= 0)
        continue

      totalPrincipalUsd += marketSupplyUsd * shareRatio
    }

    return totalPrincipalUsd
  }, [selectedUserMarketsSafe])

  const topMarketsQuery = useMarketsByChain(activeAsset ? chainId : undefined, activeAsset?.address, {
    minNetSupplyApy: MIN_CANDIDATE_NET_SUPPLY_APY,
    maxNetSupplyApy: MAX_CANDIDATE_NET_SUPPLY_APY,
    minBorrowUsd: MIN_CANDIDATE_BORROW_USD,
  })
  const topMarkets = topMarketsQuery.data

  const optimizeReadResult = useSupplyOptimizerReads({
    input: request,
    morphoAddress,
    chainId,
    publicClient,
    config: {
      chunkSize: OPTIMIZER_READ_CHUNK_SIZE,
      cacheTtlMs: OPTIMIZER_READ_CACHE_TTL_MS,
    },
  })

  useEffect(() => {
    queueLengthRef.current = queue.length
  }, [queue.length])

  const advanceQueue = useCallback(() => {
    setRequest(null)
    setQueueIndex((prev) => {
      const next = prev + 1
      if (next >= queueLengthRef.current) {
        if (scanChainId != null)
          setHomeMagicLastRunMs(scanChainId, Date.now())
        finishScan()
        setQueue([])
        return prev
      }
      return next
    })
  }, [finishScan, scanChainId])

  useEffect(() => {
    if (isConnected && userAddress && chainId)
      return

    setRequest(null)
    setQueue([])
    setQueueIndex(0)
    clearScan()
  }, [chainId, clearScan, isConnected, userAddress])

  useEffect(() => {
    if (!disabled)
      return

    setRequest(null)
    setQueue([])
    setQueueIndex(0)
    clearScan()
  }, [clearScan, disabled])

  useEffect(() => {
    if (!isConnected || !userAddress || !chainId)
      return

    pruneExpiredHomeMagicItems()

    const intervalId = window.setInterval(() => {
      pruneExpiredHomeMagicItems()
      setRescanCheckTick(prev => prev + 1)
    }, PERIODIC_RESCAN_CHECK_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [chainId, isConnected, pruneExpiredHomeMagicItems, userAddress])

  const scanAssets = useMemo(() => {
    const assetsMap = new Map<string, ScanAsset>()
    for (const p of (livePositions ?? [])) {
      if (!hasVisibleSuppliedAssets({
        userSupplyShares: p.userState.supplyShares,
        totalSupplyAssets: p.market.state.supplyAssets,
        totalSupplyShares: p.market.state.supplyShares,
      })) {
        continue
      }
      const key = p.market.loanAsset.address.toLowerCase()
      if (!assetsMap.has(key)) {
        assetsMap.set(key, {
          address: p.market.loanAsset.address,
          symbol: p.market.loanAsset.symbol,
          decimals: p.market.loanAsset.decimals ?? 18,
        })
      }
    }

    return [...assetsMap.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [livePositions])

  const canInitializeScan = useMemo(() => {
    return !disabled
      && isConnected
      && !!userAddress
      && !!chainId
      && !isLoadingPositions
      && isHomeRoute
      && !isScanning
  }, [chainId, disabled, isConnected, isHomeRoute, isLoadingPositions, isScanning, userAddress])

  useEffect(() => {
    if (!canInitializeScan)
      return
    if (!chainId)
      return
    if (scanAssets.length === 0)
      return

    const now = Date.now()
    pruneExpiredHomeMagicItems(now)
    const lastRun = getHomeMagicLastRunMs(chainId)
    if (lastRun != null && now - lastRun < SCAN_COOLDOWN_MS)
      return

    clearOpportunitiesForChain(chainId)
    setQueue(scanAssets)
    setQueueIndex(0)
    startScan({ chainId, totalAssets: scanAssets.length })
  }, [canInitializeScan, chainId, clearOpportunitiesForChain, pruneExpiredHomeMagicItems, rescanCheckTick, scanAssets, startScan])

  useEffect(() => {
    if (!isScanning)
      return
    if (!activeAsset)
      return
    setScanProgress({ assetSymbol: activeAsset.symbol, index: queueIndex + 1 })
  }, [activeAsset, isScanning, queueIndex, setScanProgress])

  useEffect(() => {
    if (!isScanning)
      return
    if (!activeAsset)
      return
    if (request)
      return
    if (topMarketsQuery.isLoading || topMarketsQuery.isFetching)
      return

    if (!topMarkets || topMarkets.length === 0 || topMarketsQuery.isError || positions.length === 0) {
      advanceQueue()
      return
    }

    const universe = new Map<string, { uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>()

    for (const m of topMarkets) {
      const id = m.uniqueKey.toLowerCase()
      const status = getMarketRisk({
        chainId,
        uniqueKey: m.uniqueKey,
        loanAssetAddress: m.loanAsset?.address,
        collateralAssetAddress: m.collateralAsset?.address,
        loanAssetSymbol: m.loanAsset?.symbol,
        collateralAssetSymbol: m.collateralAsset?.symbol,
        warnings: m.warnings,
      }).status
      if (status === 'black')
        continue
      universe.set(id, {
        uniqueKey: m.uniqueKey as `0x${string}`,
        irmAddress: m.irmAddress as `0x${string}`,
      })
    }
    for (const p of selectedUserMarketsSafe) {
      const id = p.market.uniqueKey.toLowerCase()
      const status = getMarketRisk({
        chainId,
        uniqueKey: p.market.uniqueKey,
        loanAssetAddress: p.market.loanAsset.address,
        collateralAssetAddress: p.market.collateralAsset.address,
        loanAssetSymbol: p.market.loanAsset.symbol,
        collateralAssetSymbol: p.market.collateralAsset.symbol,
        warnings: p.market.warnings,
      }).status
      if (status === 'black')
        continue
      universe.set(id, {
        uniqueKey: p.market.uniqueKey as `0x${string}`,
        irmAddress: p.market.irmAddress as `0x${string}`,
      })
    }

    const timestamp = BigInt(Math.floor(Date.now() / 1000))
    const runId = runIdRef.current++

    setRequest({
      runId,
      timestamp,
      positions,
      markets: [...universe.values()],
    })
  }, [activeAsset, chainId, isScanning, positions, request, selectedUserMarketsSafe, topMarkets, topMarketsQuery.isError, topMarketsQuery.isFetching, topMarketsQuery.isLoading])

  useEffect(() => {
    if (!request || !optimizeReadResult || !activeAsset)
      return

    const { snapshots, missingRequired } = optimizeReadResult
    if (missingRequired.length > 0 || snapshots.length === 0) {
      advanceQueue()
      return
    }

    let active = true
    const worker = new SupplyOptimizerWorker()

    worker.onmessage = (event: MessageEvent<SupplyOptimizerWorkerResponse>) => {
      if (!active)
        return

      const message = event.data
      if (!message || message.runId !== request.runId)
        return
      if (message.type !== 'done')
        return

      const runResult = message.result
      const defaultMarketApr = getDefaultMarketAprByAssetSymbol(activeAsset.symbol)
      if (runResult.status === 'success' && runResult.result) {
        const aprGainWad = runResult.result.optimized.blendedAprWad - runResult.result.current.blendedAprWad
        if (aprGainWad > noBenefitDeltaAprWad) {
          const nowMs = Date.now()
          const pct = Number(aprGainWad) / 1e16
          const currentAprPct = Number(runResult.result.current.blendedAprWad) / 1e16
          const optimizedAprPct = Number(runResult.result.optimized.blendedAprWad) / 1e16
          const relativeImprovementPct = currentAprPct > 0
            ? (pct / currentAprPct) * 100
            : undefined
          const yearlyReturnGainUsd = selectedUserMarketsUsd * (Number.isFinite(pct) ? pct / 100 : 0)
          const chainIdSafe = chainId ?? 0
          const userAddressLower = userAddress?.toLowerCase()
          const loanAssetAddressLower = activeAsset.address.toLowerCase()

          if (userAddressLower) {
            upsertPrecomputedResult({
              id: `${chainIdSafe}:${userAddressLower}:${loanAssetAddressLower}:6:${defaultMarketApr}:0`,
              chainId: chainIdSafe,
              userAddressLower,
              loanAssetAddressLower,
              maxMarketsUsed: MAX_MARKETS_USED,
              marketApr: defaultMarketApr,
              newDepositAmount: '0',
              computedAt: nowMs,
              expiresAt: nowMs + HOME_OPPORTUNITY_TTL_MS,
              result: runResult.result,
            })
          }

          addOpportunity({
            id: `${chainId}:${activeAsset.address.toLowerCase()}`,
            chainId: chainIdSafe,
            loanAssetAddress: activeAsset.address,
            loanAssetSymbol: activeAsset.symbol,
            loanAssetDecimals: activeAsset.decimals,
            currentAprPct: Number.isFinite(currentAprPct) ? currentAprPct : 0,
            optimizedAprPct: Number.isFinite(optimizedAprPct) ? optimizedAprPct : 0,
            aprGainWad,
            aprGainPct: Number.isFinite(pct) ? pct : 0,
            relativeImprovementPct: relativeImprovementPct != null && Number.isFinite(relativeImprovementPct)
              ? relativeImprovementPct
              : undefined,
            yearlyReturnGainUsd: Number.isFinite(yearlyReturnGainUsd) ? yearlyReturnGainUsd : 0,
            createdAt: nowMs,
            expiresAt: nowMs + HOME_OPPORTUNITY_TTL_MS,
          })
        }
      }

      advanceQueue()
      worker.terminate()
    }

    worker.onerror = () => {
      if (!active)
        return
      advanceQueue()
      worker.terminate()
    }

    // Use stored Market APR for this asset (WETH=4%, Stables=shared value, others=10% or stored)
    const marketAprStr = resolveMarketAprByAssetSymbol(activeAsset.symbol, marketAprBySymbol)
    const marketAprWad = BigInt(Math.floor(Number.parseFloat(marketAprStr) * 1e16))

    worker.postMessage({
      type: 'run',
      runId: request.runId,
      args: {
        markets: snapshots,
        positions: request.positions,
        newDepositAssets: 0n,
        timestamp: request.timestamp,
        constraints: {
          maxMarketsUsed: MAX_MARKETS_USED,
          minSupplyAprWad: marketAprWad,
          fallbackAprWad: marketAprWad,
          fallbackLabel: 'Withdraw to wallet',
        },
        maxIterations: MAX_OPTIMIZER_ITERATIONS,
        auto: true,
      },
    })

    return () => {
      active = false
      worker.terminate()
    }
  }, [activeAsset, addOpportunity, chainId, marketAprBySymbol, noBenefitDeltaAprWad, optimizeReadResult, request, selectedUserMarketsUsd, upsertPrecomputedResult, userAddress])

  useEffect(() => {
    return () => {
      clearScan()
    }
  }, [clearScan])
}
