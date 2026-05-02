import type { Address } from 'viem'
import type { BatchWithdrawExecutionState, BatchWithdrawPlanState, LoanAssetOption, MarketPlanItem } from './shared'
import type { SupplyOptimizerMarketSnapshot } from '~/lib/optimizer/supply-optimizer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useReadContracts, useSimulateContract, useWriteContract } from 'wagmi'
import { MORPHO_AUTH_ABI } from '~/lib/abis/bundler3'
import { IRM_RATE_AT_TARGET_ABI, SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName } from '~/lib/addresses'
import { trackEvent } from '~/lib/analytics'
import { getBundler3Config } from '~/lib/bundler3/addresses'
import { encodeGeneralAdapterMorphoWithdraw } from '~/lib/bundler3/encode'
import { makeBundler3MulticallRequest } from '~/lib/bundler3/multicall'
import { useMarketParamsById } from '~/lib/bundler3/use-market-params-by-id'
import { useBatchWithdraw } from '~/lib/contexts/batch-withdraw.context'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { useLiveMarketPositions } from '~/lib/hooks/rpc/use-live-market-positions'
import { getMorphoBlueAddress, parseTokenAmount } from '~/lib/hooks/rpc/use-morpho'
import { isMarketIdBlacklisted, useMarketBlacklistVersion } from '~/lib/market-blacklist'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { computeSupplyAfterDeltaWad } from '~/lib/optimizer/supply-optimizer'
import { isConfirmationDelayedError, useChainedTransactionFlow, waitForTruthy } from '~/lib/transactions/use-chained-transaction-flow'
import { max0, minBigint } from './shared'

// Builds a lowest-APR-first batch withdraw plan from live positions, then drives the guided Bundler3 execution flow when that plan is executable.

function fmtToken(amount: bigint, decimals: number, digits = 4): string {
  const asNum = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(asNum))
    return '—'
  return asNum.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function useBatchWithdrawController() {
  const ctx = useBatchWithdraw()
  const { address: userAddress, chain } = useAccount()
  const walletChainId = useChainId()
  const { viewingAddress, isViewingWallet } = useViewingWallet()
  const effectiveUserAddress = viewingAddress ?? userAddress
  const chainId = chain?.id ?? walletChainId
  const chainNameForLinks = chainId ? getSupportedChainName(chainId) : undefined

  const [executeError, setExecuteError] = useState<string | undefined>(undefined)
  const [isRunningFlow, setIsRunningFlow] = useState(false)
  const { startFlow, runTransactionStep, finishFlow, failFlow: failTransactionFlow, getErrorMessage } = useChainedTransactionFlow()

  useEffect(() => {
    if (!chainId)
      return
    const stored = ctx.selection.chainId
    // A stored selection from another chain would point at the wrong markets and approvals, so drop the whole plan on chain switch.
    if (stored != null && stored !== chainId)
      ctx.clear()
  }, [chainId, ctx])

  const { data: livePositions, isLoading: isLoadingPositions } = useLiveMarketPositions({ address: effectiveUserAddress, chainId })
  const blacklistVersion = useMarketBlacklistVersion()

  const visibleLivePositions = useMemo(() => {
    if (!livePositions || !chainId)
      return livePositions ?? []
    void blacklistVersion
    return livePositions.filter(position => !isMarketIdBlacklisted(position.market.uniqueKey, chainId))
  }, [blacklistVersion, chainId, livePositions])

  const loanAssetOptions = useMemo<LoanAssetOption[]>(() => {
    const map = new Map<string, LoanAssetOption>()
    for (const p of visibleLivePositions) {
      if (!hasVisibleSuppliedAssets({
        userSupplyShares: p.userState.supplyShares,
        totalSupplyAssets: p.market.state.supplyAssets,
        totalSupplyShares: p.market.state.supplyShares,
      })) {
        continue
      }
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

  const onChangeLoanAsset = useCallback((addr: string) => {
    ctx.setSelection({ chainId, loanAssetAddress: addr })
    ctx.setWithdrawAmount(undefined)
    setExecuteError(undefined)
  }, [chainId, ctx])

  const selectedUserMarkets = useMemo(() => {
    if (!selectedOption)
      return []
    const addr = selectedOption.address.toLowerCase()
    return visibleLivePositions.filter(p => hasVisibleSuppliedAssets({
      userSupplyShares: p.userState.supplyShares,
      totalSupplyAssets: p.market.state.supplyAssets,
      totalSupplyShares: p.market.state.supplyShares,
    }) && p.market.loanAsset.address.toLowerCase() === addr)
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
      // Back off slightly from the raw liquidity edge so share rounding does not turn a barely-withdrawable plan into a revert.
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

    if (items.length === 0) {
      return {
        ok: false as const,
        error: `No ${selectedOption.symbol} is currently withdrawable. Your supply is still deposited, but all visible liquidity is borrowed right now. Try again later or withdraw from individual markets as liquidity returns.`,
        items: [] as MarketPlanItem[],
      }
    }

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
    // A few cleanup passes reclaim leftover assets caused by share/asset rounding without overcomplicating the planner.
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

  const { marketParamsRead, marketParamsById } = useMarketParamsById(!!bundlerCfg, morphoAddress as Address | undefined, executeMarketIds)

  const isMorphoAuthorizedRead = useReadContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'isAuthorized',
    args: bundlerCfg && userAddress ? [userAddress as Address, bundlerCfg.generalAdapter1] as const : undefined,
    query: { enabled: !!bundlerCfg && !!morphoAddress && !!userAddress && !isViewingWallet },
  })
  const isMorphoAuthorized = (isMorphoAuthorizedRead.data ?? false) as boolean

  const clear = useCallback(() => {
    trackEvent('batch_withdraw_cleared', { loanAsset: selectedOption?.symbol, chainId })
    ctx.clear()
    setExecuteError(undefined)
    setIsRunningFlow(false)
  }, [chainId, ctx, selectedOption?.symbol])

  const resetAfterSuccess = useCallback(() => {
    ctx.clear()
    setExecuteError(undefined)
    setIsRunningFlow(false)
  }, [ctx])

  const authorizeSim = useSimulateContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'setAuthorization',
    args: bundlerCfg ? [bundlerCfg.generalAdapter1, true] as const : undefined,
    query: { enabled: !!bundlerCfg && !!morphoAddress && !!userAddress && !isViewingWallet && !isMorphoAuthorized },
  })

  const { writeContractAsync, isPending: isWriting } = useWriteContract()

  const withdrawFacts = useMemo(() => {
    if (!selectedOption || !hasPlan)
      return []
    return [
      { label: 'Withdrawn', value: `${fmtToken(plannedTotal, selectedOption.decimals)} ${selectedOption.symbol}` },
      { label: 'Markets used', value: String(plan.items.length) },
      { label: 'Requested', value: `${fmtToken(parsedWithdrawAssets, selectedOption.decimals)} ${selectedOption.symbol}` },
      { label: 'Remaining unmet', value: `${fmtToken(plan.remaining, selectedOption.decimals)} ${selectedOption.symbol}` },
    ]
  }, [hasPlan, parsedWithdrawAssets, plan.items.length, plan.remaining, plannedTotal, selectedOption])

  const withdrawItems = useMemo(() => {
    if (!selectedOption || !hasPlan)
      return []
    return plan.items.map(item => ({
      title: `${item.collateralSymbol} / ${selectedOption.symbol}`,
      subtitle: item.fullExit ? 'Full exit' : 'Partial withdraw',
      value: `${fmtToken(item.plannedWithdrawAssets, selectedOption.decimals)} ${selectedOption.symbol}`,
      tone: 'orange' as const,
    }))
  }, [hasPlan, plan.items, selectedOption])

  const bundle = useMemo(() => {
    if (!bundlerCfg || !userAddress || isViewingWallet || !hasPlan)
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
  }, [bundlerCfg, hasPlan, isViewingWallet, marketParamsById, plan.items, userAddress])

  const multicallRequest = useMemo(() => {
    if (!bundlerCfg || !bundle || bundle.length === 0)
      return undefined
    return makeBundler3MulticallRequest({ bundler3: bundlerCfg.bundler3, bundle })
  }, [bundle, bundlerCfg])

  const multicallSim = useSimulateContract({
    ...(multicallRequest as any),
    query: {
      enabled: !!multicallRequest && !!bundlerCfg && !!userAddress && !isViewingWallet && isMorphoAuthorized,
    },
  })

  const latestStateRef = useRef({
    isMorphoAuthorized,
    authorizeRequest: authorizeSim.data?.request,
    executeRequest: multicallSim.data?.request,
    withdrawFacts,
    withdrawItems,
  })

  useEffect(() => {
    latestStateRef.current = {
      isMorphoAuthorized,
      authorizeRequest: authorizeSim.data?.request,
      executeRequest: multicallSim.data?.request,
      withdrawFacts,
      withdrawItems,
    }
  }, [authorizeSim.data?.request, isMorphoAuthorized, multicallSim.data?.request, withdrawFacts, withdrawItems])

  const refreshExecutionState = useCallback(async () => {
    await Promise.all([
      isMorphoAuthorizedRead.refetch(),
      marketParamsRead.refetch(),
      authorizeSim.refetch(),
      multicallSim.refetch(),
    ])
  }, [authorizeSim, isMorphoAuthorizedRead, marketParamsRead, multicallSim])

  const requiredExecutionSteps = useMemo(() => {
    const steps: string[] = []
    if (!isMorphoAuthorized)
      steps.push('Authorize adapter')
    steps.push('Execute withdraw')
    return steps
  }, [isMorphoAuthorized])

  // Guided flow: authorize the adapter if needed, wait for the refreshed executable multicall, then submit the batch withdraw.
  const onStartExecutionFlow = useCallback(async () => {
    if (!selectedOption)
      return

    setExecuteError(undefined)
    setIsRunningFlow(true)

    trackEvent('batch_withdraw_execution_started', {
      loanAsset: selectedOption.symbol,
      chainId,
      marketsUsed: plan.items.length,
    })

    const steps = [] as Array<{ key: string, label: string }>
    if (!latestStateRef.current.isMorphoAuthorized) {
      steps.push({ key: 'authorizeWallet', label: 'Confirm adapter authorization in wallet' })
      steps.push({ key: 'authorizeConfirm', label: 'Confirming adapter authorization onchain' })
    }
    steps.push({ key: 'executeWallet', label: 'Confirm batch withdraw in wallet' })
    steps.push({ key: 'executeConfirm', label: 'Confirming batch withdraw onchain' })

    const scope = startFlow({
      kind: 'batchWithdraw',
      title: `Withdraw ${fmtToken(plannedTotal, selectedOption.decimals)} ${selectedOption.symbol}`,
      summary: 'Preparing guided withdrawal',
      chainId,
      steps,
    })

    try {
      if (!latestStateRef.current.isMorphoAuthorized) {
        const authorizeRequest = latestStateRef.current.authorizeRequest
        if (!authorizeRequest)
          throw new Error('Authorization transaction is not ready yet')
        await runTransactionStep({
          scope,
          walletStepKey: 'authorizeWallet',
          confirmStepKey: 'authorizeConfirm',
          chainId,
          walletSummary: 'Waiting for adapter authorization in wallet',
          confirmSummary: 'Confirming adapter authorization onchain',
          fallbackError: 'Adapter authorization failed',
          run: () => writeContractAsync(authorizeRequest as any),
        })
        await refreshExecutionState()
        await waitForTruthy(() => latestStateRef.current.isMorphoAuthorized ? true : undefined, {
          errorMessage: 'Authorization succeeded but state did not refresh in time',
        })
      }

      const executeRequest = await waitForTruthy(() => latestStateRef.current.executeRequest, {
        errorMessage: 'Batch withdraw transaction is not ready yet',
      })
      const txHash = await runTransactionStep({
        scope,
        walletStepKey: 'executeWallet',
        confirmStepKey: 'executeConfirm',
        chainId,
        walletSummary: 'Waiting for batch withdraw confirmation in wallet',
        confirmSummary: 'Confirming batch withdraw onchain',
        fallbackError: 'Batch withdraw failed',
        run: () => writeContractAsync(executeRequest as any),
      })

      finishFlow(scope, {
        title: `Withdrew ${fmtToken(plannedTotal, selectedOption.decimals)} ${selectedOption.symbol}`,
        summary: 'Batch withdraw completed successfully.',
        txHash,
        chainId,
        facts: latestStateRef.current.withdrawFacts,
        items: latestStateRef.current.withdrawItems,
        showModal: true,
      })
      resetAfterSuccess()
      trackEvent('batch_withdraw_execution_success', {
        loanAsset: selectedOption.symbol,
        chainId,
        marketsUsed: plan.items.length,
      })
    }
    catch (error) {
      if (isConfirmationDelayedError(error)) {
        setExecuteError(undefined)
        return
      }
      const message = getErrorMessage(error, 'Batch withdraw failed')
      setExecuteError(message)
      failTransactionFlow(scope, message)
      trackEvent('batch_withdraw_execution_failed', {
        loanAsset: selectedOption.symbol,
        chainId,
        error: message.slice(0, 200),
      })
    }
    finally {
      setIsRunningFlow(false)
    }
  }, [chainId, failTransactionFlow, finishFlow, getErrorMessage, plan.items.length, plannedTotal, refreshExecutionState, resetAfterSuccess, runTransactionStep, selectedOption, startFlow, writeContractAsync])

  const execution: BatchWithdrawExecutionState = {
    bundlerCfg,
    morphoAddress,
    isMorphoAuthorized,
    authorizeAvailable: !!authorizeSim.data?.request,
    multicallError: (multicallSim.error as any)?.shortMessage ?? (multicallSim.error as any)?.message,
    executeError,
    readOnly: isViewingWallet,
    canExecute: !!bundle
      && bundle.length > 0
      && !!bundlerCfg
      && !!userAddress
      && !isViewingWallet
      && !isWriting
      && !isRunningFlow
      && (!isMorphoAuthorized ? !!authorizeSim.data?.request : true)
      && (isMorphoAuthorized ? !!multicallSim.data?.request : true),
    isWriting: isWriting || isRunningFlow,
    isConfirming: false,
    onAuthorizeAdapter: onStartExecutionFlow,
    onExecuteBundle: onStartExecutionFlow,
    requiredSteps: requiredExecutionSteps,
  }

  return {
    userAddress: effectiveUserAddress,
    isViewingWallet,
    chainId,
    chainNameForLinks,
    isLoadingPositions,
    loanAssetOptions,
    selectedLoanAssetAddress,
    selectedOption,
    withdrawAmount,
    symbol,
    computedMarkets,
    plan,
    hasPlan,
    plannedTotal,
    execution,
    executeError,
    clear,
    onChangeLoanAsset,
    onChangeWithdrawAmount: ctx.setWithdrawAmount,
    hasSomethingToClear: !!selectedLoanAssetAddress || !!withdrawAmount || !!executeError,
  }
}
