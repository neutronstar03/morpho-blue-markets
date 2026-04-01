import type { Address } from 'viem'
import type { BatchWithdrawExecutionState, BatchWithdrawPlanState, LoanAssetOption, MarketPlanItem } from './shared'
import type { SupplyOptimizerMarketSnapshot } from '~/lib/optimizer/supply-optimizer'
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { MORPHO_AUTH_ABI } from '~/lib/abis/bundler3'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { getBundler3Config } from '~/lib/bundler3/addresses'
import { encodeGeneralAdapterMorphoWithdraw } from '~/lib/bundler3/encode'
import { makeBundler3MulticallRequest } from '~/lib/bundler3/multicall'
import { useBatchWithdraw } from '~/lib/contexts/batch-withdraw.context'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount } from '~/lib/hooks/rpc/use-morpho'
import { isMarketIdManuallyBlacklisted, useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { computeSupplyAfterDeltaWad } from '~/lib/optimizer/supply-optimizer'
import { BatchWithdrawExecutionPanel } from './execution-panel'
import { BatchWithdrawForm } from './form'
import { BatchWithdrawResults } from './results'
import { max0, minBigint } from './shared'

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
  const blacklistVersion = useMarketBlacklistVersion()

  const visibleLivePositions = useMemo(() => {
    if (!livePositions || !chainId)
      return livePositions ?? []
    void blacklistVersion
    return livePositions.filter(position => !isMarketIdManuallyBlacklisted(position.market.uniqueKey, chainId))
  }, [blacklistVersion, chainId, livePositions])

  const loanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    const map = new Map<string, LoanAssetOption>()
    for (const p of visibleLivePositions) {
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
  }, [visibleLivePositions])

  const selectedLoanAssetAddress = ctx.selection.loanAssetAddress ?? ''
  const selectedOption = useMemo(() => {
    const addr = selectedLoanAssetAddress.toLowerCase()
    if (!addr)
      return undefined
    return loanAssetOptions.find(o => o.address.toLowerCase() === addr)
  }, [loanAssetOptions, selectedLoanAssetAddress])

  const onChangeLoanAsset = (addr: string) => {
    ctx.setSelection({ chainId, loanAssetAddress: addr })
    ctx.setWithdrawAmount(undefined)
    setExecuteError(undefined)
  }

  const selectedUserMarkets = useMemo(() => {
    if (!selectedOption)
      return []
    const addr = selectedOption.address.toLowerCase()
    return visibleLivePositions.filter((p) => {
      return p.userState.supplyShares > 0n && p.market.loanAsset.address.toLowerCase() === addr
    })
  }, [selectedOption, visibleLivePositions])

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
      const maxWithdrawSharesRaw = minBigint(userSupplyShares, liquidityShares)
      let maxWithdrawShares = maxWithdrawSharesRaw
      if (maxWithdrawSharesRaw > 0n && maxWithdrawSharesRaw < userSupplyShares) {
        let percentHundredths = (maxWithdrawSharesRaw * 10_000n) / userSupplyShares
        if (percentHundredths > 10_000n)
          percentHundredths = 10_000n
        if (percentHundredths > 0n && percentHundredths < 10_000n)
          percentHundredths -= 1n

        const safeShares = (userSupplyShares * percentHundredths) / 10_000n
        maxWithdrawShares = minBigint(maxWithdrawSharesRaw, safeShares)
      }

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

  const plan = useMemo<BatchWithdrawPlanState>(() => {
    if (!computedMarkets.ok)
      return { ok: false, error: computedMarkets.error, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied: 0n, totalWithdrawable: 0n }
    const base = computedMarkets.items

    const totalSupplied = base.reduce((sum, x) => sum + x.suppliedAssets, 0n)
    const totalWithdrawable = base.reduce((sum, x) => sum + x.maxWithdrawAssets, 0n)

    if (!selectedOption)
      return { ok: false, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }
    if (parsedWithdrawAssets <= 0n)
      return { ok: false, error: undefined, items: [], remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }

    const sorted = [...base].sort((a, b) => {
      if (a.supplyAprWad === b.supplyAprWad)
        return a.marketId.localeCompare(b.marketId)
      return a.supplyAprWad < b.supplyAprWad ? -1 : 1
    })

    if (parsedWithdrawAssets >= totalWithdrawable) {
      const out = sorted
        .filter(m => m.maxWithdrawShares > 0n)
        .map(m => ({
          ...m,
          plannedWithdrawShares: m.maxWithdrawShares,
          plannedWithdrawAssets: m.maxWithdrawAssets,
          fullExit: m.maxWithdrawShares === m.userSupplyShares,
        }))
      return { ok: true, error: undefined, items: out, remaining: 0n, overWithdrawAssets: 0n, totalSupplied, totalWithdrawable }
    }

    const assetsFromShares = (m: MarketPlanItem, shares: bigint): bigint => {
      if (shares <= 0n || m.marketTotalSupplyShares <= 0n)
        return 0n
      return (shares * m.marketTotalSupplyAssets) / m.marketTotalSupplyShares
    }

    const ceilDiv = (a: bigint, b: bigint): bigint => {
      if (b <= 0n || a <= 0n)
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

      const desiredShares = m.marketTotalSupplyAssets > 0n
        ? (remainingAssets * m.marketTotalSupplyShares) / m.marketTotalSupplyAssets
        : 0n

      const sharesToWithdraw = minBigint(desiredShares, m.maxWithdrawShares)
      if (sharesToWithdraw <= 0n)
        continue

      plannedSharesById.set(m.marketId.toLowerCase(), sharesToWithdraw)
      remainingAssets -= assetsFromShares(m, sharesToWithdraw)
    }

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
      ok: true,
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
    if (!bundlerCfg || !userAddress || !hasPlan)
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
    return makeBundler3MulticallRequest({ bundler3: bundlerCfg.bundler3, bundle })
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

  const execution: BatchWithdrawExecutionState = {
    bundlerCfg,
    morphoAddress,
    isMorphoAuthorized,
    authorizeAvailable: !!authorizeSim.data?.request,
    multicallError: (multicallSim.error as any)?.shortMessage ?? (multicallSim.error as any)?.message,
    executeError,
    canExecute: !!multicallSim.data?.request
      && !!bundle
      && bundle.length > 0
      && !!bundlerCfg
      && !!userAddress
      && isMorphoAuthorized
      && !isWriting
      && !receipt.isLoading,
    isWriting,
    isConfirming: receipt.isLoading,
    onAuthorizeAdapter,
    onExecuteBundle,
  }

  return (
    <Card className="mb-8" data-testid="batch-withdraw-card">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">
            Batch withdraw
            <span className="text-xs text-gray-400"> (beta)</span>
          </h2>
          <p className="text-sm text-gray-400">Withdraws from your lowest-APR markets first.</p>
        </div>

        {(selectedLoanAssetAddress || withdrawAmount || executeError) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clear}
            className="ml-auto h-8 px-2.5 text-xs"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {!userAddress && (
          <div className="text-sm text-gray-300">Connect your wallet to plan a batch withdraw.</div>
        )}

        {userAddress && (
          <>
            <BatchWithdrawForm
              isLoadingPositions={isLoadingPositions}
              loanAssetOptions={loanAssetOptions}
              selectedLoanAssetAddress={selectedLoanAssetAddress}
              selectedOption={selectedOption}
              withdrawAmount={withdrawAmount}
              symbol={symbol}
              plan={plan}
              computedMarketsOk={computedMarkets.ok}
              onChangeLoanAsset={onChangeLoanAsset}
              onChangeWithdrawAmount={value => ctx.setWithdrawAmount(value)}
            />

            {plan.error && (
              <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                {plan.error}
              </div>
            )}

            {hasPlan && selectedOption && (
              <>
                <BatchWithdrawResults
                  plan={plan}
                  selectedOption={selectedOption}
                  symbol={symbol}
                  plannedTotal={plannedTotal}
                  chainId={chainId}
                  chainNameForLinks={chainNameForLinks}
                />
                <BatchWithdrawExecutionPanel execution={execution} />
              </>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
