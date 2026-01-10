import type { SupplyOptimizerMarketSnapshot, UserSupplyPosition } from '~/lib/optimizer/supply-optimizer'
import { useEffect, useMemo, useState } from 'react'
import { createSearchParams, Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { useSupplyApyOptimizer } from '~/lib/contexts/supply-apy-optimizer'
import { formatBigintShort } from '~/lib/formatters'
import { useMarketsByChain } from '~/lib/hooks/graphql/use-markets-by-chain'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount, useTokenBalance } from '~/lib/hooks/rpc/use-morpho'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { ZERO_ADDRESS } from '~/lib/morpho/market-id'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { optimizeSupplyAllocationWithPositions } from '~/lib/optimizer/supply-optimizer'
import { BundleOptimizerResult } from '~/pages/home/bundle-optimizer-result'

function pctFromWad(wad: bigint, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(wad, 18)) * 100
  if (!Number.isFinite(asNum))
    return '—'
  return `${asNum.toFixed(digits)}%`
}

function fmtToken(amount: bigint, decimals: number, digits = 4): string {
  const asNum = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(asNum))
    return '—'
  return asNum.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function trimTrailingZerosDecimalString(s: string): string {
  // Ensure "3072.0000" -> "3072" and "12.3400" -> "12.34"
  if (!s.includes('.'))
    return s
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed
}

interface LoanAssetOption {
  address: string
  symbol: string
  decimals: number
  oraclePriceUsd?: number | null
}

export function SupplyApyOptimizer() {
  // If the blended APY improvement is <= this threshold, show a "no-op" plan.
  // 0.25% = 0.0025 in WAD terms (1e18 = 100%).
  const NO_BENEFIT_DELTA_APY_WAD = 2_500_000_000_000_000n
  const MAX_OPTIMIZER_ITERATIONS = 800

  const ctx = useSupplyApyOptimizer()
  const { address: userAddress, chain } = useAccount()
  const minMoveSize = ctx.inputs.minMoveSize
  const newDepositAmount = ctx.inputs.newDepositAmount
  const setDerived = ctx.setDerived
  const setMinMoveSize = ctx.setMinMoveSize
  const setNewDepositAmount = ctx.setNewDepositAmount
  const beginRun = ctx.beginRun
  const finishRun = ctx.finishRun

  const [maxMarketsInput, setMaxMarketsInput] = useLocalStorage<string>(
    'supply-apy-optimizer:max-markets',
    '5',
  )

  const {
    data: livePositions,
    isLoading: isLoadingPositions,
  } = useLiveMarketPositions()

  const loanAssetOptions = useMemo<LoanAssetOption[]>(() => {
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
  const { data: topMarkets } = useMarketsByChain(selectedLoanAddr ? chain?.id : undefined, selectedLoanAddr)

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

    // Set default only if the user hasn't typed anything yet.
    // Important: don't treat empty string ("") as "unset" because users often clear the input
    // before typing a new number; resetting to the default mid-typing feels broken.
    if (minMoveSize == null) {
      const rawStep = total / 100n
      const stepAssets = rawStep > 0n ? rawStep : 1n
      setMinMoveSize(formatUnits(stepAssets, selectedOption.decimals))
    }
  }, [minMoveSize, selectedOption, selectedUserMarkets, setDerived, setMinMoveSize, userMarketStates])

  // Default "additional amount to supply" to the user's wallet balance for the selected token.
  // Only set a default if the user hasn't typed anything yet.
  useEffect(() => {
    if (!selectedOption)
      return
    if (newDepositAmount != null)
      return
    const bal = walletBalanceRaw ?? 0n
    if (bal <= 0n)
      return
    // Prefill with a parseable string (no locale commas).
    setNewDepositAmount(formatUnits(bal, selectedOption.decimals))
  }, [newDepositAmount, selectedOption, setNewDepositAmount, walletBalanceRaw])

  const [optimizeRequest, setOptimizeRequest] = useState<null | {
    runId: number
    timestamp: bigint
    stepAssets: bigint
    newDepositAssets: bigint
    maxMarketsUsed: number
    positions: UserSupplyPosition[]
    markets: Array<{ uniqueKey: `0x${string}`, irmAddress: `0x${string}` }>
  }>(null)

  const optimizeContracts = useMemo(() => {
    if (!optimizeRequest)
      return []
    return optimizeRequest.markets.flatMap((m) => {
      return [
        {
          address: morphoAddress,
          abi: SIMPLIFIED_MORPHO_BLUE_ABI,
          functionName: 'market' as const,
          args: [m.uniqueKey] as const,
        },
        {
          address: m.irmAddress,
          abi: IRM_RATE_AT_TARGET_ABI,
          functionName: 'rateAtTarget' as const,
          args: [m.uniqueKey] as const,
        },
      ] as const
    })
  }, [optimizeRequest, morphoAddress])

  const { data: optimizeReadResults } = useReadContracts({
    contracts: optimizeContracts as any,
    allowFailure: true,
    query: { enabled: !!optimizeRequest },
  })

  // When onchain snapshot is ready, run optimizer.
  useEffect(() => {
    if (!optimizeRequest)
      return
    if (!optimizeReadResults || optimizeReadResults.length !== optimizeRequest.markets.length * 2)
      return

    const requiredUserMarketIds = new Set(optimizeRequest.positions.map(p => p.marketId.toLowerCase()))
    const snapshots: SupplyOptimizerMarketSnapshot[] = []
    const missingRequired: string[] = []

    for (let i = 0; i < optimizeRequest.markets.length; i++) {
      const id = optimizeRequest.markets[i].uniqueKey
      const marketRes = optimizeReadResults[2 * i]
      const rateRes = optimizeReadResults[2 * i + 1]

      const required = requiredUserMarketIds.has(id.toLowerCase())
      if (marketRes?.status !== 'success' || rateRes?.status !== 'success' || !marketRes.result || rateRes.result == null) {
        if (required)
          missingRequired.push(id)
        continue
      }

      const tuple = normalizeMorphoMarketState(marketRes.result)
      if (!tuple) {
        if (required)
          missingRequired.push(id)
        continue
      }
      const rateAtTarget = rateRes.result as bigint

      // Basic sanity: skip if timestamp < lastUpdate.
      if (optimizeRequest.timestamp < tuple.lastUpdate) {
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
      })
    }

    if (missingRequired.length > 0) {
      finishRun(optimizeRequest.runId, undefined, `Missing onchain data for ${missingRequired.length} of your markets; cannot optimize.`)
      setOptimizeRequest(null)
      return
    }

    try {
      const res = optimizeSupplyAllocationWithPositions({
        markets: snapshots,
        positions: optimizeRequest.positions,
        newDepositAssets: optimizeRequest.newDepositAssets,
        stepAssets: optimizeRequest.stepAssets,
        timestamp: optimizeRequest.timestamp,
        maxIterations: MAX_OPTIMIZER_ITERATIONS,
        constraints: {
          maxMarketsUsed: optimizeRequest.maxMarketsUsed,
        },
      })
      if (res.iterations >= MAX_OPTIMIZER_ITERATIONS) {
        finishRun(
          optimizeRequest.runId,
          undefined,
          'Optimizer stopped early (maximum iterations reached). Try increasing “Minimum move size”.',
        )
      }
      else {
        finishRun(optimizeRequest.runId, res, undefined)
      }
    }
    catch (e: any) {
      finishRun(optimizeRequest.runId, undefined, e?.message ?? 'Optimizer failed')
    }
    finally {
      setOptimizeRequest(null)
    }
  }, [finishRun, optimizeReadResults, optimizeRequest])

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
    // Mark as "unset" so the default can be computed/preset for the new selection.
    ctx.setMinMoveSize(undefined)
    ctx.setNewDepositAmount(undefined)
  }

  const canOptimize = !!selectedOption
    && (ctx.derived.positions?.length ?? 0) > 0
    && !!ctx.inputs.minMoveSize
    && (() => {
      const parsed = Number.parseInt((maxMarketsInput ?? '').trim(), 10)
      return Number.isFinite(parsed) && parsed >= 1
    })()
    && !ctx.run.isRunning
    && !!userAddress
    && !!chain?.id

  const onOptimize = () => {
    if (!selectedOption || !userAddress || !chain?.id)
      return
    const positions = ctx.derived.positions ?? []
    if (positions.length === 0)
      return

    const timestamp = BigInt(Math.floor(Date.now() / 1000))
    const runId = beginRun({ timestamp })

    const stepAssets = parseTokenAmount(ctx.inputs.minMoveSize ?? '', selectedOption.decimals)
    if (stepAssets <= 0n) {
      finishRun(runId, undefined, 'Minimum move size must be > 0')
      return
    }

    const maxMarketsUsed = Number.parseInt((maxMarketsInput ?? '').trim(), 10)
    if (!Number.isFinite(maxMarketsUsed) || maxMarketsUsed < 1) {
      finishRun(runId, undefined, 'Max markets must be >= 1')
      return
    }

    const newDepositAssets = parseTokenAmount(ctx.inputs.newDepositAmount ?? '', selectedOption.decimals)

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

    setOptimizeRequest({
      runId,
      timestamp,
      stepAssets,
      newDepositAssets,
      maxMarketsUsed,
      positions,
      markets: [...universe.values()],
    })
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
    const apyGainWad = result.optimized.blendedApyWad - result.current.blendedApyWad
    const noBenefit = apyGainWad <= NO_BENEFIT_DELTA_APY_WAD
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
  }, [NO_BENEFIT_DELTA_APY_WAD, ctx.run.error, parsedNewDepositAssets, result])

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

  return (
    <Card className="mb-8">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">Supply APY optimizer</h2>
          <p className="text-sm text-gray-400">
            Suggests how to rebalance your existing supply to improve APY.
          </p>
        </div>
        {ctx.started && (
          <button
            type="button"
            onClick={() => ctx.clear()}
            className="ml-auto px-2 py-1 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800"
            title="Clear"
          >
            X
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {!ctx.started && (
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-gray-300">
              Pick a supplied token and compute an optimized rebalance plan.
            </div>
            <Button onClick={onStart} disabled={!canStart}>
              {isLoadingPositions ? 'Loading…' : 'Start'}
            </Button>
          </div>
        )}

        {ctx.started && (
          <>
            {loanAssetOptions.length === 0 && (
              <div className="text-sm text-gray-300">
                No supply positions detected on this chain.
              </div>
            )}

            {canPick && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Asset to optimize
                  </label>
                  <select
                    value={ctx.selection.loanAssetAddress ?? ''}
                    onChange={e => onChangeLoanAsset(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" disabled>Select an asset</option>
                    {loanAssetOptions.map(o => (
                      <option key={o.address} value={o.address}>
                        {o.symbol}
                      </option>
                    ))}
                  </select>
                  {selectedOption && (
                    <div className="text-xs text-gray-500">
                      Your supplied:
                      {' '}
                      {fmtToken(ctx.derived.totalSuppliedAssets ?? 0n, selectedOption.decimals)}
                      {' '}
                      {selectedOption.symbol}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-sm font-medium text-gray-200">
                      Minimum move size
                    </label>
                    <InfoTooltip
                      ariaLabel="Minimum move size info"
                      content={(
                        <span>
                          Default is 1% of your supplied amount.
                        </span>
                      )}
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ctx.inputs.minMoveSize ?? ''}
                      onChange={e => ctx.setMinMoveSize(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-3 py-2 pr-16 border border-gray-700 bg-gray-900 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
                      {symbol}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Additional amount to supply
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={ctx.inputs.newDepositAmount ?? ''}
                      onChange={e => ctx.setNewDepositAmount(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-3 py-2 pr-16 border border-gray-700 bg-gray-900 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
                      {symbol}
                    </span>
                  </div>
                  {selectedOption && (
                    <div className="text-xs text-gray-500">
                      Wallet balance:
                      {' '}
                      {fmtToken(walletBalanceRaw ?? 0n, selectedOption.decimals)}
                      {' '}
                      {selectedOption.symbol}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="block text-gray-200">
                      Max markets
                    </Label>
                    <InfoTooltip
                      ariaLabel="Max markets info"
                      content={(
                        <span>
                          Limits the number of markets used in the optimized allocation.
                        </span>
                      )}
                    />
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={maxMarketsInput ?? ''}
                    onChange={e => setMaxMarketsInput(e.target.value)}
                    className="w-24 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="flex items-center">
                  <Button
                    className="w-full"
                    onClick={onOptimize}
                    disabled={!canOptimize}
                  >
                    {ctx.run.isRunning ? 'Optimizing…' : 'Optimize'}
                  </Button>
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
                    <div className="text-xs text-gray-400">Current blended APY</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.current.blendedApyWad)}</div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                    <div className="text-xs text-gray-400">Optimized blended APY</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.optimized.blendedApyWad)}</div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                    <div className="text-xs text-gray-400">Iterations</div>
                    <div className="text-lg font-semibold text-white tabular-nums">{displayResult.iterations}</div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-gray-700 rounded-md">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800/40">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Current</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Delta</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">APY after</th>
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
                              {pctFromWad(p.supplyApyAfterWad)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2">
                  <div
                    className="
                      flex flex-row justify-center items-center mx-4
                      sm:justify-end
                      gap-1 sm:gap-2
                    "
                  >
                    <p className="text-xs text-gray-400 whitespace-nowrap">Total allocated</p>
                    <p className="text-sm text-white whitespace-nowrap">
                      {formatBigintShort(totalAllocatedAssets, selectedOption.decimals)}
                      {' '}
                      {symbol}
                    </p>
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
