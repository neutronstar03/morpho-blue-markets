import type { Address } from 'viem'
import type { SupplyOptimizerMarketSnapshot } from '~/lib/optimizer/supply-optimizer'
import { useEffect, useMemo, useState } from 'react'
import { createSearchParams, Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { MORPHO_AUTH_ABI } from '~/lib/abis/bundler3'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { getBundler3Config } from '~/lib/bundler3/addresses'
import { encodeGeneralAdapterMorphoWithdraw } from '~/lib/bundler3/encode'
import { makeBundler3MulticallRequest } from '~/lib/bundler3/multicall'
import { useBatchWithdraw } from '~/lib/contexts/batch-withdraw.context'
import { formatBigintShort } from '~/lib/formatters'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount } from '~/lib/hooks/rpc/use-morpho'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { computeSupplyAfterDeltaWad } from '~/lib/optimizer/supply-optimizer'
import { pctFromWad, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'

interface LoanAssetOption {
  address: string
  symbol: string
  decimals: number
}

interface MarketPlanItem {
  marketId: `0x${string}`
  collateralSymbol: string
  userSupplyShares: bigint
  suppliedAssets: bigint
  marketTotalSupplyAssets: bigint
  marketTotalSupplyShares: bigint
  liquidityAssets: bigint
  liquidityShares: bigint
  maxWithdrawShares: bigint
  maxWithdrawAssets: bigint
  supplyAprWad: bigint
  plannedWithdrawAssets: bigint
  plannedWithdrawShares: bigint
  fullExit: boolean
}

function max0(x: bigint): bigint {
  return x > 0n ? x : 0n
}

function minBigint(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

export function BatchWithdraw() {
  const ctx = useBatchWithdraw()
  const { address: userAddress, chain } = useAccount()
  const chainId = chain?.id
  const chainNameForLinks = chainId ? getSupportedChainName(chainId) : undefined

  const [executeError, setExecuteError] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!chainId)
      return
    const stored = ctx.selection.chainId
    if (stored != null && stored !== chainId)
      ctx.clear()
  }, [chainId, ctx])

  const { data: livePositions, isLoading: isLoadingPositions } = useLiveMarketPositions()

  const loanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    const map = new Map<string, LoanAssetOption>()
    for (const p of (livePositions ?? [])) {
      if (p.userState.supplyShares <= 0n)
        continue
      const addr = p.market.loanAsset.address.toLowerCase()
      if (!map.has(addr)) {
        map.set(addr, {
          address: p.market.loanAsset.address,
          symbol: p.market.loanAsset.symbol,
          decimals: p.market.loanAsset.decimals ?? 18,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [livePositions])

  const selectedLoanAssetAddress = ctx.selection.loanAssetAddress ?? ''
  const selectedOption = useMemo(() => {
    const addr = selectedLoanAssetAddress.toLowerCase()
    if (!addr)
      return undefined
    return loanAssetOptions.find(o => o.address.toLowerCase() === addr)
  }, [loanAssetOptions, selectedLoanAssetAddress])

  const onChangeLoanAsset = (addr: string) => {
    ctx.setSelection({
      chainId,
      loanAssetAddress: addr,
    })
    // Clear amount when switching assets to avoid accidental cross-token parses.
    ctx.setWithdrawAmount(undefined)
    setExecuteError(undefined)
  }

  const selectedUserMarkets = useMemo(() => {
    if (!selectedOption)
      return []
    const addr = selectedOption.address.toLowerCase()
    return (livePositions ?? []).filter((p) => {
      return p.userState.supplyShares > 0n && p.market.loanAsset.address.toLowerCase() === addr
    })
  }, [livePositions, selectedOption])

  const morphoAddress = useMemo(() => getMorphoBlueAddress(chainId), [chainId])

  const marketStateContracts = useMemo(() => {
    if (!morphoAddress || selectedUserMarkets.length === 0)
      return []
    return selectedUserMarkets.map(m => ({
      address: morphoAddress,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'market' as const,
      args: [m.market.uniqueKey as `0x${string}`] as const,
    }))
  }, [morphoAddress, selectedUserMarkets])

  const marketStatesRead = useReadContracts({
    contracts: marketStateContracts as any,
    allowFailure: true,
    query: {
      enabled: !!morphoAddress && selectedUserMarkets.length > 0,
      staleTime: 20_000,
    },
  })

  const rateAtTargetContracts = useMemo(() => {
    if (selectedUserMarkets.length === 0)
      return []
    return selectedUserMarkets.map(m => ({
      address: m.market.irmAddress as `0x${string}`,
      abi: IRM_RATE_AT_TARGET_ABI,
      functionName: 'rateAtTarget' as const,
      args: [m.market.uniqueKey as `0x${string}`] as const,
    }))
  }, [selectedUserMarkets])

  const rateAtTargetRead = useReadContracts({
    contracts: rateAtTargetContracts as any,
    allowFailure: true,
    query: {
      enabled: selectedUserMarkets.length > 0,
      staleTime: 5 * 60 * 1000,
    },
  })

  const withdrawAmount = ctx.inputs.withdrawAmount ?? ''
  const symbol = selectedOption?.symbol ?? ''

  const parsedWithdrawAssets = useMemo(() => {
    if (!selectedOption)
      return 0n
    return parseTokenAmount(withdrawAmount.trim(), selectedOption.decimals)
  }, [selectedOption, withdrawAmount])

  const nowSec = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [selectedOption?.address, chainId, selectedUserMarkets.length])

  const computedMarkets = useMemo(() => {
    if (!selectedOption)
      return { ok: false as const, error: undefined, items: [] as MarketPlanItem[] }
    if (selectedUserMarkets.length === 0)
      return { ok: false as const, error: 'No supply positions for this asset', items: [] as MarketPlanItem[] }

    const marketReads = marketStatesRead.data
    const rateReads = rateAtTargetRead.data
    if (!marketReads || marketReads.length !== selectedUserMarkets.length)
      return { ok: false as const, error: 'Loading market state…', items: [] as MarketPlanItem[] }
    if (!rateReads || rateReads.length !== selectedUserMarkets.length)
      return { ok: false as const, error: 'Loading IRM rates…', items: [] as MarketPlanItem[] }

    const items: MarketPlanItem[] = []

    for (let i = 0; i < selectedUserMarkets.length; i++) {
      const p = selectedUserMarkets[i]
      const mRes = marketReads[i]
      const rRes = rateReads[i]
      if (mRes?.status !== 'success' || !mRes.result)
        return { ok: false as const, error: 'Missing onchain market data (retry)', items: [] as MarketPlanItem[] }
      if (rRes?.status !== 'success' || rRes.result == null)
        return { ok: false as const, error: 'Missing IRM data (retry)', items: [] as MarketPlanItem[] }

      const st = normalizeMorphoMarketState(mRes.result)
      if (!st)
        return { ok: false as const, error: 'Failed to decode market state', items: [] as MarketPlanItem[] }

      const totalSupplyAssets = st.totalSupplyAssets
      const totalSupplyShares = st.totalSupplyShares
      const totalBorrowAssets = st.totalBorrowAssets
      const userSupplyShares = p.userState.supplyShares
      if (totalSupplyShares <= 0n || userSupplyShares <= 0n)
        continue

      const suppliedAssets = (userSupplyShares * totalSupplyAssets) / totalSupplyShares
      if (suppliedAssets <= 0n)
        continue

      const liquidityAssets = max0(totalSupplyAssets - totalBorrowAssets)
      const liquidityShares = totalSupplyAssets > 0n
        ? (liquidityAssets * totalSupplyShares) / totalSupplyAssets
        : 0n
      // Safety margin (match WithdrawForm percent-mode Max): derive a percent from shares,
      // round DOWN, then back off by 0.01% to avoid boundary reverts.
      const maxWithdrawSharesRaw = minBigint(userSupplyShares, liquidityShares)
      let maxWithdrawShares = maxWithdrawSharesRaw
      if (maxWithdrawSharesRaw > 0n && maxWithdrawSharesRaw < userSupplyShares) {
        // 0..10000 (hundredths of percent)
        let percentHundredths = (maxWithdrawSharesRaw * 10_000n) / userSupplyShares
        if (percentHundredths > 10_000n)
          percentHundredths = 10_000n
        if (percentHundredths > 0n && percentHundredths < 10_000n)
          percentHundredths -= 1n

        const safeShares = (userSupplyShares * percentHundredths) / 10_000n
        maxWithdrawShares = minBigint(maxWithdrawSharesRaw, safeShares)
      }

      // Final tiny backoff if we're still exactly at the liquidity edge.
      if (maxWithdrawShares > 0n && maxWithdrawShares === liquidityShares && maxWithdrawShares < userSupplyShares)
        maxWithdrawShares -= 1n
      const maxWithdrawAssets = totalSupplyShares > 0n && maxWithdrawShares > 0n
        ? (maxWithdrawShares * totalSupplyAssets) / totalSupplyShares
        : 0n

      const snapshot: SupplyOptimizerMarketSnapshot = {
        marketId: p.market.uniqueKey as `0x${string}`,
        uniqueKey: p.market.uniqueKey as `0x${string}`,
        totalSupplyAssets,
        totalBorrowAssets,
        lastUpdate: st.lastUpdate,
        feeWad: st.fee,
        rateAtTarget: rRes.result as bigint,
      }

      const apr = computeSupplyAfterDeltaWad({ market: snapshot, deltaSupplyAssets: 0n, timestamp: nowSec }).supplyAprWad

      items.push({
        marketId: p.market.uniqueKey as `0x${string}`,
        collateralSymbol: p.market.collateralAsset.symbol,
        userSupplyShares,
        suppliedAssets,
        marketTotalSupplyAssets: totalSupplyAssets,
        marketTotalSupplyShares: totalSupplyShares,
        liquidityAssets,
        liquidityShares,
        maxWithdrawShares,
        maxWithdrawAssets,
        supplyAprWad: apr,
        plannedWithdrawAssets: 0n,
        plannedWithdrawShares: 0n,
        fullExit: false,
      })
    }

    if (items.length === 0)
      return { ok: false as const, error: 'No withdrawable supply found', items: [] as MarketPlanItem[] }

    return { ok: true as const, error: undefined, items }
  }, [marketStatesRead.data, nowSec, rateAtTargetRead.data, selectedOption, selectedUserMarkets])

  const plan = useMemo(() => {
    if (!computedMarkets.ok)
      return { ok: false as const, error: computedMarkets.error, items: [] as MarketPlanItem[], remaining: 0n, overWithdrawAssets: 0n, totalSupplied: 0n, totalWithdrawable: 0n }
    const base = computedMarkets.items

    const totalSupplied = base.reduce((sum, x) => sum + x.suppliedAssets, 0n)
    const totalWithdrawable = base.reduce((sum, x) => sum + x.maxWithdrawAssets, 0n)

    if (!selectedOption)
      return { ok: false as const, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }
    if (parsedWithdrawAssets <= 0n)
      return { ok: false as const, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }

    const sorted = [...base].sort((a, b) => {
      if (a.supplyAprWad === b.supplyAprWad)
        return a.marketId.localeCompare(b.marketId)
      return a.supplyAprWad < b.supplyAprWad ? -1 : 1
    })

    // If user requests >= total withdrawable, just withdraw max shares in each market.
    if (parsedWithdrawAssets >= totalWithdrawable) {
      const out = sorted
        .filter(m => m.maxWithdrawShares > 0n)
        .map(m => ({
          ...m,
          plannedWithdrawShares: m.maxWithdrawShares,
          plannedWithdrawAssets: m.maxWithdrawAssets,
          fullExit: m.maxWithdrawShares === m.userSupplyShares,
        }))
      return {
        ok: true as const,
        error: undefined,
        items: out,
        remaining: 0n,
        overWithdrawAssets: 0n,
        totalSupplied,
        totalWithdrawable,
      }
    }

    const assetsFromShares = (m: MarketPlanItem, shares: bigint): bigint => {
      if (shares <= 0n)
        return 0n
      if (m.marketTotalSupplyShares <= 0n)
        return 0n
      return (shares * m.marketTotalSupplyAssets) / m.marketTotalSupplyShares
    }

    const ceilDiv = (a: bigint, b: bigint): bigint => {
      if (b <= 0n)
        return 0n
      if (a <= 0n)
        return 0n
      return (a + (b - 1n)) / b
    }

    let remainingAssets = parsedWithdrawAssets
    const plannedSharesById = new Map<string, bigint>()

    for (const m of sorted) {
      if (remainingAssets <= 0n)
        break
      if (m.maxWithdrawShares <= 0n)
        continue

      // Convert the remaining desired assets into shares for this market, rounding DOWN.
      // Then cap by liquidity-capped shares.
      const desiredShares = m.marketTotalSupplyAssets > 0n
        ? (remainingAssets * m.marketTotalSupplyShares) / m.marketTotalSupplyAssets
        : 0n

      const sharesToWithdraw = minBigint(desiredShares, m.maxWithdrawShares)
      if (sharesToWithdraw <= 0n)
        continue

      plannedSharesById.set(m.marketId.toLowerCase(), sharesToWithdraw)
      remainingAssets -= assetsFromShares(m, sharesToWithdraw)
    }

    // Dust sweep (withdraw at least requested): because assetsFromShares floors,
    // small remainders (e.g. 1 micro-USDC) may not be representable by a +1 share step.
    // Instead, jump to the minimum shares required to increase the floored assets
    // by at least the remaining amount.
    let dustPass = 0
    while (remainingAssets > 0n && dustPass < 5) {
      dustPass++
      let progressed = false

      for (const m of sorted) {
        if (remainingAssets <= 0n)
          break
        const id = m.marketId.toLowerCase()
        const currentShares = plannedSharesById.get(id) ?? 0n
        const slack = m.maxWithdrawShares - currentShares
        if (slack <= 0n)
          continue

        const currentAssets = assetsFromShares(m, currentShares)
        const targetAssets = currentAssets + remainingAssets
        const requiredShares = ceilDiv(targetAssets * m.marketTotalSupplyShares, m.marketTotalSupplyAssets)
        let deltaShares = requiredShares - currentShares
        if (deltaShares <= 0n)
          continue
        if (deltaShares > slack)
          deltaShares = slack

        const nextShares = currentShares + deltaShares
        const nextAssets = assetsFromShares(m, nextShares)
        const deltaAssets = nextAssets - currentAssets
        if (deltaAssets <= 0n)
          continue

        plannedSharesById.set(id, nextShares)
        remainingAssets -= deltaAssets
        progressed = true
      }

      if (!progressed)
        break
    }

    const out: MarketPlanItem[] = []
    for (const m of sorted) {
      const shares = plannedSharesById.get(m.marketId.toLowerCase()) ?? 0n
      if (shares <= 0n)
        continue
      out.push({
        ...m,
        plannedWithdrawShares: shares,
        plannedWithdrawAssets: assetsFromShares(m, shares),
        fullExit: shares === m.userSupplyShares,
      })
    }

    const overWithdrawAssets = remainingAssets < 0n ? -remainingAssets : 0n

    return {
      ok: true as const,
      error: undefined,
      items: out,
      remaining: remainingAssets > 0n ? remainingAssets : 0n,
      overWithdrawAssets,
      totalSupplied,
      totalWithdrawable,
    }
  }, [computedMarkets, parsedWithdrawAssets, selectedOption])

  const hasPlan = plan.ok && plan.items.length > 0
  const plannedTotal = useMemo(() => {
    if (!hasPlan)
      return 0n
    return plan.items.reduce((sum, x) => sum + x.plannedWithdrawAssets, 0n)
  }, [hasPlan, plan.items])

  // --- Bundle execution (Bundler3) ---
  const bundlerCfg = useMemo(() => (chainId ? getBundler3Config(chainId) : undefined), [chainId])

  const executeMarketIds = useMemo(() => {
    if (!hasPlan)
      return [] as `0x${string}`[]
    const ids = new Set<string>()
    for (const p of plan.items) {
      if (p.plannedWithdrawShares > 0n)
        ids.add(p.marketId.toLowerCase())
    }
    return [...ids.values()].map(x => x as `0x${string}`)
  }, [hasPlan, plan.items])

  const marketParamsContracts = useMemo(() => {
    if (!bundlerCfg || !morphoAddress || executeMarketIds.length === 0)
      return []
    return executeMarketIds.map(id => ({
      address: morphoAddress,
      abi: MORPHO_AUTH_ABI,
      functionName: 'idToMarketParams' as const,
      args: [id] as const,
    }))
  }, [bundlerCfg, executeMarketIds, morphoAddress])

  const marketParamsRead = useReadContracts({
    contracts: marketParamsContracts as any,
    allowFailure: true,
    query: { enabled: !!bundlerCfg && !!morphoAddress && marketParamsContracts.length > 0 },
  })

  const marketParamsById = useMemo(() => {
    const map = new Map<string, any>()
    const reads = marketParamsRead.data
    if (!reads || reads.length !== marketParamsContracts.length)
      return map
    for (let i = 0; i < marketParamsContracts.length; i++) {
      const id = executeMarketIds[i]
      const res = reads[i]
      if (res?.status !== 'success' || !res.result)
        continue
      const r: any = res.result
      const params = Array.isArray(r)
        ? { loanToken: r[0], collateralToken: r[1], oracle: r[2], irm: r[3], lltv: r[4] }
        : { loanToken: r.loanToken, collateralToken: r.collateralToken, oracle: r.oracle, irm: r.irm, lltv: r.lltv }
      map.set(id.toLowerCase(), params)
    }
    return map
  }, [executeMarketIds, marketParamsContracts.length, marketParamsRead.data])

  const isMorphoAuthorizedRead = useReadContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'isAuthorized',
    args: bundlerCfg && userAddress ? [userAddress as Address, bundlerCfg.generalAdapter1] as const : undefined,
    query: { enabled: !!bundlerCfg && !!morphoAddress && !!userAddress },
  })
  const isMorphoAuthorized = (isMorphoAuthorizedRead.data ?? false) as boolean

  const clear = () => {
    ctx.clear()
    setExecuteError(undefined)
  }

  const authorizeSim = useSimulateContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'setAuthorization',
    args: bundlerCfg ? [bundlerCfg.generalAdapter1, true] as const : undefined,
    query: { enabled: !!bundlerCfg && !!morphoAddress && !!userAddress && !isMorphoAuthorized },
  })

  const { writeContract, isPending: isWriting, data: txHash } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!receipt.isSuccess)
      return
    isMorphoAuthorizedRead.refetch()
    marketParamsRead.refetch()
  }, [receipt.isSuccess])

  const bundle = useMemo(() => {
    if (!bundlerCfg || !userAddress)
      return undefined
    if (!hasPlan)
      return undefined

    const calls = [] as ReturnType<typeof encodeGeneralAdapterMorphoWithdraw>[]
    for (const p of plan.items) {
      if (p.plannedWithdrawShares <= 0n)
        continue
      const params = marketParamsById.get(p.marketId.toLowerCase())
      if (!params)
        return undefined

      calls.push(encodeGeneralAdapterMorphoWithdraw({
        adapter: bundlerCfg.generalAdapter1,
        marketParams: params,
        assets: 0n,
        shares: p.plannedWithdrawShares,
        receiver: userAddress as Address,
      }))
    }
    return calls
  }, [bundlerCfg, hasPlan, marketParamsById, plan.items, userAddress])

  const multicallRequest = useMemo(() => {
    if (!bundlerCfg || !bundle || bundle.length === 0)
      return undefined
    return makeBundler3MulticallRequest({
      bundler3: bundlerCfg.bundler3,
      bundle,
    })
  }, [bundle, bundlerCfg])

  const multicallSim = useSimulateContract({
    ...(multicallRequest as any),
    query: {
      enabled: !!multicallRequest && !!bundlerCfg && !!userAddress && isMorphoAuthorized,
    },
  })

  const onAuthorizeAdapter = () => {
    setExecuteError(undefined)
    if (!authorizeSim.data?.request)
      return
    writeContract(authorizeSim.data.request as any)
  }

  const onExecuteBundle = () => {
    setExecuteError(undefined)
    if (!multicallSim.data?.request)
      return
    writeContract(multicallSim.data.request)
  }

  const canExecute = !!multicallSim.data?.request
    && !!bundle
    && bundle.length > 0
    && !!bundlerCfg
    && !!userAddress
    && isMorphoAuthorized
    && !isWriting
    && !receipt.isLoading

  return (
    <Card className="mb-8" data-testid="batch-withdraw-card">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">
            Batch withdraw
            <span className="text-xs text-gray-400"> (beta)</span>
          </h2>
          <p className="text-sm text-gray-400">
            Withdraws from your lowest-APR markets first.
          </p>
        </div>

        {(selectedLoanAssetAddress || withdrawAmount || executeError) && (
          <button
            type="button"
            onClick={clear}
            className="ml-auto px-2 py-1 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800 cursor-pointer"
            title="Clear"
          >
            X
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {!userAddress && (
          <div className="text-sm text-gray-300">
            Connect your wallet to plan a batch withdraw.
          </div>
        )}

        {userAddress && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4" data-testid="batch-withdraw-form">
              <div className="space-y-2 md:col-span-2">
                <Label className="block text-gray-200">Asset</Label>
                <select
                  value={selectedLoanAssetAddress}
                  onChange={e => onChangeLoanAsset(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isLoadingPositions || loanAssetOptions.length === 0}
                >
                  <option value="" disabled>
                    {isLoadingPositions ? 'Loading…' : 'Select an asset'}
                  </option>
                  {loanAssetOptions.map(o => (
                    <option key={o.address} value={o.address}>
                      {o.symbol}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="block text-gray-200">Amount</Label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={withdrawAmount}
                    onChange={e => ctx.setWithdrawAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full pr-20 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                    disabled={!selectedOption}
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
                    {symbol}
                  </span>
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!selectedOption)
                      return
                    const s = trimTrailingZerosDecimalString(formatUnits(plan.totalWithdrawable, selectedOption.decimals))
                    if (s)
                      ctx.setWithdrawAmount(s)
                  }}
                  disabled={!selectedOption || !computedMarkets.ok}
                  title="Set amount to max withdrawable"
                >
                  Max
                </Button>
              </div>
            </div>

            {selectedOption && (
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Supplied:
                  {' '}
                  <span className="text-gray-300">
                    {formatBigintShort(plan.totalSupplied, selectedOption.decimals)}
                    {' '}
                    {symbol}
                  </span>
                </span>
                <span>
                  Max withdrawable:
                  {' '}
                  <span className="text-gray-300">
                    {formatBigintShort(plan.totalWithdrawable, selectedOption.decimals)}
                    {' '}
                    {symbol}
                  </span>
                </span>
              </div>
            )}

            {plan.error && (
              <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                {plan.error}
              </div>
            )}

            {hasPlan && selectedOption && (
              <>
                {plan.remaining > 0n && (
                  <div className="text-sm text-orange-200 border border-orange-900/40 bg-orange-950/20 rounded-md p-3">
                    Not enough available liquidity to withdraw the full amount. Planned:
                    {' '}
                    {formatBigintShort(plannedTotal, selectedOption.decimals)}
                    {' '}
                    {symbol}
                    .
                    {' '}
                    Remaining:
                    {' '}
                    {formatBigintShort(plan.remaining, selectedOption.decimals)}
                    {' '}
                    {symbol}
                    .
                  </div>
                )}

                {plan.overWithdrawAssets > 0n && (
                  <div className="text-xs text-gray-400">
                    Due to rounding, the plan may withdraw slightly more than requested:
                    {' '}
                    {formatBigintShort(plan.overWithdrawAssets, selectedOption.decimals)}
                    {' '}
                    {symbol}
                    .
                  </div>
                )}

                <div className="overflow-x-auto border border-gray-700 rounded-md">
                  <table className="min-w-full divide-y divide-gray-700" data-testid="batch-withdraw-result-table">
                    <thead className="bg-gray-800/40">
                      <tr>
                        <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">APR</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Supplied</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Max</th>
                        <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Planned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-900/20">
                      {plan.items.map((p) => {
                        const marketLabel = `${p.collateralSymbol} / ${symbol}`
                        const deepLinkAmount = trimTrailingZerosDecimalString(formatUnits(p.plannedWithdrawAssets, selectedOption.decimals))
                        const deepLinkSearch = p.plannedWithdrawAssets > 0n && deepLinkAmount
                          ? createSearchParams({
                              tab: 'withdraw',
                              unit: 'asset',
                              amount: deepLinkAmount,
                            }).toString()
                          : ''

                        return (
                          <tr key={p.marketId}>
                            <td className="px-3 sm:px-4 py-2 text-sm text-white">
                              <div className="flex items-center gap-2">
                                {chainId
                                  ? (
                                      <Link
                                        to={{
                                          pathname: `/market/${p.marketId}/${chainId}`,
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
                              {pctFromWad(p.supplyAprWad)}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {formatBigintShort(p.suppliedAssets, selectedOption.decimals)}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                              {formatBigintShort(p.maxWithdrawAssets, selectedOption.decimals)}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-sm text-orange-200 text-right tabular-nums">
                              {formatBigintShort(p.plannedWithdrawAssets, selectedOption.decimals)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {bundlerCfg && morphoAddress && (
                  <div className="mt-6 border border-gray-700 rounded-md p-3 bg-gray-900/30 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-200 font-medium">Execute withdraw (1 tx)</div>
                      <div className="text-xs text-gray-500">via Bundler3</div>
                    </div>

                    {!isMorphoAuthorized && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-gray-400">
                          One-time setup: authorize the Bundler adapter on Morpho (required for withdraws).
                        </div>
                        <Button onClick={onAuthorizeAdapter} disabled={!authorizeSim.data?.request || isWriting}>
                          Authorize
                        </Button>
                      </div>
                    )}

                    {multicallSim.error && (
                      <div className="text-xs text-red-300">
                        {((multicallSim.error as any)?.shortMessage ?? (multicallSim.error as any)?.message ?? 'Simulation failed')}
                      </div>
                    )}

                    {executeError && (
                      <div className="text-xs text-red-300">
                        {executeError}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        onClick={onExecuteBundle}
                        disabled={!canExecute}
                      >
                        {isWriting ? 'Sending…' : receipt.isLoading ? 'Confirming…' : 'Withdraw (1 tx)'}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
