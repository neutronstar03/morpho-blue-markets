import type { SupplyOptimizerMarketSnapshot } from './supply-optimizer'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'

export interface OptimizerMarketMeta {
  uniqueKey: `0x${string}`
  irmAddress: `0x${string}`
  rewardSupplyAprWad?: bigint
}

export interface OptimizerReadInput {
  runId: number
  timestamp: bigint
  positions: Array<{ marketId: `0x${string}` }>
  markets: OptimizerMarketMeta[]
}

export interface OptimizerReadResult {
  snapshots: SupplyOptimizerMarketSnapshot[]
  skippedMarkets: number
  missingRequired: string[]
}

export interface OptimizerReadConfig {
  chunkSize: number
  cacheTtlMs: number
}

export function useSupplyOptimizerReads(args: {
  input: OptimizerReadInput | null
  morphoAddress?: `0x${string}`
  chainId?: number
  publicClient?: {
    multicall: (args: { contracts: any[], allowFailure: boolean }) => Promise<any[]>
  }
  config: OptimizerReadConfig
}) {
  const { input, morphoAddress, chainId, publicClient, config } = args
  const [result, setResult] = useState<OptimizerReadResult | null>(null)

  const chunks = useMemo(() => {
    if (!input)
      return [] as OptimizerMarketMeta[][]
    const out: OptimizerMarketMeta[][] = []
    for (let i = 0; i < input.markets.length; i += config.chunkSize) {
      out.push(input.markets.slice(i, i + config.chunkSize))
    }
    return out
  }, [config.chunkSize, input])

  const cacheKey = useMemo(() => {
    if (!input || !chainId)
      return undefined
    // Include rewardSupplyAprWad in the cache key so that incentive program
    // starts/ends automatically invalidate stale read results.
    const ids = input.markets
      .map(m => `${m.uniqueKey.toLowerCase()}:${m.rewardSupplyAprWad ?? 0n}`)
      .sort()
      .join('|')
    return `${chainId}::${ids}`
  }, [chainId, input])

  const readCacheRef = useRef(new Map<string, { timestamp: number, data: OptimizerReadResult }>())

  useEffect(() => {
    let cancelled = false

    const runReads = async () => {
      if (!input || !publicClient) {
        setResult(null)
        return
      }

      if (cacheKey) {
        const cached = readCacheRef.current.get(cacheKey)
        if (cached && Date.now() - cached.timestamp <= config.cacheTtlMs) {
          setResult(cached.data)
          return
        }
      }

      const requiredUserMarketIds = new Set(input.positions.map(p => p.marketId.toLowerCase()))
      const snapshots: SupplyOptimizerMarketSnapshot[] = []
      const missingRequired: string[] = []
      let skippedMarkets = 0

      for (const chunk of chunks) {
        if (chunk.length === 0)
          continue

        const marketContracts = chunk.map(m => ({
          address: morphoAddress,
          abi: SIMPLIFIED_MORPHO_BLUE_ABI,
          functionName: 'market' as const,
          args: [m.uniqueKey] as const,
        }))

        const rateContracts = chunk.map(m => ({
          address: m.irmAddress,
          abi: IRM_RATE_AT_TARGET_ABI,
          functionName: 'rateAtTarget' as const,
          args: [m.uniqueKey] as const,
        }))

        const marketRead = marketContracts.length > 0
          ? await publicClient.multicall({ contracts: marketContracts as any, allowFailure: true })
          : []
        const rateRead = rateContracts.length > 0
          ? await publicClient.multicall({ contracts: rateContracts as any, allowFailure: true })
          : []

        for (let i = 0; i < chunk.length; i++) {
          const market = chunk[i]
          const id = market.uniqueKey
          const marketRes = marketRead[i]
          const rateRes = rateRead[i]

          const required = requiredUserMarketIds.has(id.toLowerCase())
          if (marketRes?.status !== 'success' || rateRes?.status !== 'success' || !marketRes.result || rateRes.result == null) {
            skippedMarkets += 1
            if (required)
              missingRequired.push(id)
            continue
          }

          const tuple = normalizeMorphoMarketState(marketRes.result)
          if (!tuple) {
            skippedMarkets += 1
            if (required)
              missingRequired.push(id)
            continue
          }

          const rateAtTarget = rateRes.result as bigint

          if (input.timestamp < tuple.lastUpdate) {
            skippedMarkets += 1
            if (required)
              missingRequired.push(id)
            continue
          }

          snapshots.push({
            marketId: id,
            uniqueKey: id,
            totalSupplyAssets: tuple.totalSupplyAssets,
            totalBorrowAssets: tuple.totalBorrowAssets,
            lastUpdate: tuple.lastUpdate,
            feeWad: tuple.fee,
            rateAtTarget,
            rewardSupplyAprWad: market.rewardSupplyAprWad,
            rewardSupplyAssetsBase: tuple.totalSupplyAssets,
          })
        }
      }

      const computed: OptimizerReadResult = { snapshots, skippedMarkets, missingRequired }

      if (cacheKey) {
        readCacheRef.current.set(cacheKey, {
          timestamp: Date.now(),
          data: computed,
        })
      }

      if (!cancelled)
        setResult(computed)
    }

    runReads()

    return () => {
      cancelled = true
    }
  }, [cacheKey, chunks, config.cacheTtlMs, input, morphoAddress, publicClient])

  return result
}
