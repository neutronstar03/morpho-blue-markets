import type { UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress } from '~/lib/hooks/rpc/use-morpho'
import { runSupplyOptimizer } from '~/lib/optimizer/supply-optimizer-runner'
import { useSupplyOptimizerReads } from '~/lib/optimizer/use-supply-optimizer-reads'
import { getHomeMagicLastRunMs, setHomeMagicLastRunMs } from '../stores/home-magic-last-run'
import { useHomeMagicOptimizerStore } from '../stores/home-magic-optimizer.store'
import { useMarketsByChain } from './graphql/use-markets-by-chain'

interface ScanAsset {
  address: string
  symbol: string
  decimals: number
}

const NO_BENEFIT_DELTA_APR_WAD = 2_500_000_000_000_000n
const MAX_MARKETS_USED = 6
const MAX_OPTIMIZER_ITERATIONS = 1000
const OPTIMIZER_READ_CHUNK_SIZE = 50
const OPTIMIZER_READ_CACHE_TTL_MS = 60_000
const ONE_HOUR_MS = 60 * 60 * 1000

export function useHomeMagicOptimizerScan() {
  const { isConnected, address: userAddress, chain } = useAccount()
  const publicClient = usePublicClient()
  const {
    data: livePositions,
    isLoading: isLoadingPositions,
  } = useLiveMarketPositions()

  const {
    isScanning,
    startScan,
    setScanProgress,
    finishScan,
    clearScan,
    addOpportunity,
    clearOpportunitiesForChain,
  } = useHomeMagicOptimizerStore()

  const [queue, setQueue] = useState<ScanAsset[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [request, setRequest] = useState<null | {
    runId: number
    timestamp: bigint
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
  }>(null)

  const runIdRef = useRef(1)

  const activeAsset = queue[queueIndex]
  const chainId = chain?.id
  const morphoAddress = useMemo(() => getMorphoBlueAddress(chainId), [chainId])

  const selectedUserMarkets = useMemo(() => {
    if (!activeAsset)
      return []

    const addr = activeAsset.address.toLowerCase()
    return (livePositions ?? []).filter((p) => {
      return p.userState.supplyShares > 0n
        && p.market.loanAsset.address.toLowerCase() === addr
    })
  }, [activeAsset, livePositions])

  const positions = useMemo<UserSupplyPosition[]>(() => {
    const out: UserSupplyPosition[] = []

    for (const p of selectedUserMarkets) {
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
  }, [selectedUserMarkets])

  const topMarketsQuery = useMarketsByChain(activeAsset ? chainId : undefined, activeAsset?.address)
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

  const advanceQueue = () => {
    setRequest(null)
    setQueueIndex((prev) => {
      const next = prev + 1
      if (next >= queue.length) {
        finishScan()
        setQueue([])
        return prev
      }
      return next
    })
  }

  useEffect(() => {
    if (isConnected && userAddress && chainId)
      return

    setRequest(null)
    setQueue([])
    setQueueIndex(0)
    clearScan()
  }, [chainId, clearScan, isConnected, userAddress])

  useEffect(() => {
    if (!isConnected || !userAddress || !chainId || isLoadingPositions)
      return
    if (isScanning)
      return

    const assetsMap = new Map<string, ScanAsset>()
    for (const p of (livePositions ?? [])) {
      if (p.userState.supplyShares <= 0n)
        continue
      const key = p.market.loanAsset.address.toLowerCase()
      if (!assetsMap.has(key)) {
        assetsMap.set(key, {
          address: p.market.loanAsset.address,
          symbol: p.market.loanAsset.symbol,
          decimals: p.market.loanAsset.decimals ?? 18,
        })
      }
    }

    const assets = [...assetsMap.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
    if (assets.length === 0)
      return

    const now = Date.now()
    const lastRun = getHomeMagicLastRunMs(chainId)
    if (lastRun != null && now - lastRun < ONE_HOUR_MS)
      return

    setHomeMagicLastRunMs(chainId, now)
    clearOpportunitiesForChain(chainId)
    setQueue(assets)
    setQueueIndex(0)
    startScan({ chainId, totalAssets: assets.length })
  }, [chainId, clearOpportunitiesForChain, isConnected, isLoadingPositions, isScanning, livePositions, startScan, userAddress])

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
      universe.set(id, {
        uniqueKey: m.uniqueKey as `0x${string}`,
        irmAddress: m.irmAddress as `0x${string}`,
      })
    }
    for (const p of selectedUserMarkets) {
      const id = p.market.uniqueKey.toLowerCase()
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
  }, [activeAsset, isScanning, positions, request, selectedUserMarkets, topMarkets, topMarketsQuery.isError, topMarketsQuery.isFetching, topMarketsQuery.isLoading])

  useEffect(() => {
    if (!request || !optimizeReadResult || !activeAsset)
      return

    const { snapshots, missingRequired } = optimizeReadResult
    if (missingRequired.length > 0 || snapshots.length === 0) {
      advanceQueue()
      return
    }

    const runResult = runSupplyOptimizer({
      markets: snapshots,
      positions: request.positions,
      newDepositAssets: 0n,
      timestamp: request.timestamp,
      constraints: {
        maxMarketsUsed: MAX_MARKETS_USED,
      },
      maxIterations: MAX_OPTIMIZER_ITERATIONS,
      auto: true,
    })

    if (runResult.status === 'success' && runResult.result) {
      const aprGainWad = runResult.result.optimized.blendedAprWad - runResult.result.current.blendedAprWad
      if (aprGainWad > NO_BENEFIT_DELTA_APR_WAD) {
        const pct = Number(aprGainWad) / 1e16
        addOpportunity({
          id: `${chainId}:${activeAsset.address.toLowerCase()}`,
          chainId: chainId ?? 0,
          loanAssetAddress: activeAsset.address,
          loanAssetSymbol: activeAsset.symbol,
          loanAssetDecimals: activeAsset.decimals,
          aprGainWad,
          aprGainPct: Number.isFinite(pct) ? pct : 0,
          createdAt: Date.now(),
        })
      }
    }

    advanceQueue()
  }, [activeAsset, addOpportunity, chainId, optimizeReadResult, request])

  useEffect(() => {
    return () => {
      clearScan()
    }
  }, [clearScan])
}
