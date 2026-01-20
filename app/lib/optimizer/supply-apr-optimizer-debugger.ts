/* eslint-disable no-console */
import type { OptimizeSupplyWithPositionsResult } from './supply-optimizer'
import type { OptimizerReadResult } from './use-supply-optimizer-reads'
import { formatUnits } from 'viem'
import { pctFromWad, trimTrailingZerosDecimalString } from './supply-optimizer-ui-utils'

export interface SupplyOptimizerDebugRequest {
  runId: number
  timestamp: bigint
  stepAssets?: bigint
  newDepositAssets: bigint
  maxMarketsUsed: number
  positions: Array<{ marketId: `0x${string}`, suppliedAssets: bigint }>
  markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
}

export interface SupplyOptimizerDebugMarketMeta {
  collateralSymbol?: string
}

export interface SupplyOptimizerDebugLoanToken {
  symbol?: string
  decimals?: number
}

export interface SupplyOptimizerDebugState {
  request?: SupplyOptimizerDebugRequest | null
  readResult?: OptimizerReadResult | null
  result?: OptimizeSupplyWithPositionsResult | null
  displayResult?: OptimizeSupplyWithPositionsResult | null
  marketMetaById?: Record<string, SupplyOptimizerDebugMarketMeta>
  loanToken?: SupplyOptimizerDebugLoanToken | null
}

const latestState: SupplyOptimizerDebugState = {}

export function setSupplyOptimizerDebugState(update: {
  request?: SupplyOptimizerDebugRequest | null
  readResult?: OptimizerReadResult | null
  result?: OptimizeSupplyWithPositionsResult | null
  displayResult?: OptimizeSupplyWithPositionsResult | null
  marketMetaById?: Map<string, SupplyOptimizerDebugMarketMeta> | Record<string, SupplyOptimizerDebugMarketMeta>
  loanToken?: SupplyOptimizerDebugLoanToken | null
}) {
  if (update.request !== undefined)
    latestState.request = update.request
  if (update.readResult !== undefined)
    latestState.readResult = update.readResult
  if (update.result !== undefined)
    latestState.result = update.result
  if (update.displayResult !== undefined)
    latestState.displayResult = update.displayResult
  if (update.loanToken !== undefined)
    latestState.loanToken = update.loanToken
  if (update.marketMetaById !== undefined) {
    if (update.marketMetaById instanceof Map) {
      const record: Record<string, SupplyOptimizerDebugMarketMeta> = {}
      for (const [id, meta] of update.marketMetaById.entries()) {
        record[id.toLowerCase()] = { collateralSymbol: meta?.collateralSymbol }
      }
      latestState.marketMetaById = record
    }
    else {
      latestState.marketMetaById = update.marketMetaById
    }
  }
}

function formatAmount(amount: bigint, decimals: number) {
  return trimTrailingZerosDecimalString(formatUnits(amount, decimals))
}

function buildMarketLabel(marketId: string, loanSymbol: string, marketMetaById?: Record<string, SupplyOptimizerDebugMarketMeta>) {
  const meta = marketMetaById?.[marketId.toLowerCase()]
  if (meta?.collateralSymbol && loanSymbol)
    return `${meta.collateralSymbol} / ${loanSymbol}`
  return `${marketId.slice(0, 10)}…${marketId.slice(-6)}`
}

function buildDebugSummary() {
  const request = latestState.request ?? null
  const readResult = latestState.readResult ?? null
  const rawResult = latestState.result ?? null
  const displayResult = latestState.displayResult ?? rawResult
  const loanSymbol = latestState.loanToken?.symbol ?? ''
  const loanDecimals = latestState.loanToken?.decimals ?? 18
  const marketMetaById = latestState.marketMetaById

  const snapshotIds = new Set(readResult?.snapshots.map((s: { marketId: string }) => s.marketId.toLowerCase()) ?? [])
  const skippedMarketIds = request
    ? request.markets
        .map(m => m.uniqueKey)
        .filter(id => !snapshotIds.has(id.toLowerCase()))
    : []

  const totalAllocated = displayResult
    ? displayResult.positions.reduce((sum, p) => sum + p.amountAssets, 0n)
    : 0n

  const positionsPretty = (displayResult?.positions ?? []).map((p) => {
    const contributionWad = totalAllocated > 0n
      ? (p.amountAssets * p.supplyAprAfterWad) / totalAllocated
      : 0n
    return {
      marketId: p.marketId,
      marketLabel: buildMarketLabel(p.marketId, loanSymbol, marketMetaById),
      current: formatAmount(p.currentUserAssets, loanDecimals),
      target: formatAmount(p.amountAssets, loanDecimals),
      delta: formatAmount(p.deltaAssets, loanDecimals),
      aprAfter: pctFromWad(p.supplyAprAfterWad),
      contribution: pctFromWad(contributionWad),
    }
  })

  const openedMarketsPretty = (displayResult?.positions ?? [])
    .filter(p => p.currentUserAssets === 0n)
    .map((p) => {
      const contributionWad = totalAllocated > 0n
        ? (p.amountAssets * p.supplyAprAfterWad) / totalAllocated
        : 0n
      return {
        marketId: p.marketId,
        marketLabel: buildMarketLabel(p.marketId, loanSymbol, marketMetaById),
        target: formatAmount(p.amountAssets, loanDecimals),
        aprAfter: pctFromWad(p.supplyAprAfterWad),
        contribution: pctFromWad(contributionWad),
      }
    })

  return {
    raw: {
      request,
      readResult,
      result: rawResult,
      displayResult,
      skippedMarketIds,
    },
    pretty: {
      request: request
        ? {
            runId: request.runId,
            timestamp: request.timestamp.toString(),
            stepAssets: request.stepAssets?.toString(),
            newDepositAssets: request.newDepositAssets.toString(),
            maxMarketsUsed: request.maxMarketsUsed,
            positions: request.positions.map(p => ({
              marketId: p.marketId,
              marketLabel: buildMarketLabel(p.marketId, loanSymbol, marketMetaById),
              suppliedAssets: formatAmount(p.suppliedAssets, loanDecimals),
            })),
            markets: request.markets.map(m => ({
              marketId: m.uniqueKey,
              marketLabel: buildMarketLabel(m.uniqueKey, loanSymbol, marketMetaById),
              irmAddress: m.irmAddress,
            })),
          }
        : null,
      readStatus: readResult
        ? {
            snapshots: readResult.snapshots.length,
            skippedMarkets: readResult.skippedMarkets,
            missingRequired: readResult.missingRequired,
            skippedMarketIds,
          }
        : null,
      resultSummary: displayResult
        ? {
            iterations: displayResult.iterations,
            currentApr: pctFromWad(displayResult.current.blendedAprWad),
            optimizedApr: pctFromWad(displayResult.optimized.blendedAprWad),
            unallocatedNewDeposit: displayResult.unallocatedNewDepositAssets?.toString(),
            infeasibleWithdraw: displayResult.infeasibleWithdrawAssets?.toString(),
            totalAllocated: formatAmount(totalAllocated, loanDecimals),
          }
        : null,
      positions: positionsPretty,
      openedMarkets: openedMarketsPretty,
    },
  }
}

function downloadJson(filename: string, data: unknown) {
  const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)
  const blob = new Blob([JSON.stringify(data, replacer, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function dumpSupplyOptimizerFixtures() {
  const summary = buildDebugSummary()
  console.group('Supply optimizer debug')
  console.log('Inputs:', summary.pretty.request)
  console.log('Read status:', summary.pretty.readStatus)
  console.log('Result summary:', summary.pretty.resultSummary)
  console.table(summary.pretty.positions)
  if (summary.pretty.openedMarkets.length > 0) {
    console.group('Opened markets')
    console.table(summary.pretty.openedMarkets)
    console.groupEnd()
  }
  console.groupEnd()
  downloadJson('optimizer.debug.json', summary)
  if (!summary.raw.request || !summary.raw.readResult) {
    console.warn('Optimizer debug: request or readResult missing. Re-run optimizer and dump again after results appear.')
  }
  return summary
}
