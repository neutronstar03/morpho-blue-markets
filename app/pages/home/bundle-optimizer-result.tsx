import type { Address, Hex } from 'viem'
import type { OptimizerMarketMeta } from './supply-apr-optimizer/shared'
import type { TransactionRecapItem } from '~/lib/contexts/transaction-feedback.types'
import type { ExecutionGuard } from '~/lib/market-risk/types'
import type { OptimizeSupplyWithPositionsResult } from '~/lib/optimizer/supply-optimizer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, formatUnits } from 'viem'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSignTypedData,
  useSimulateContract,
  useWriteContract,
} from 'wagmi'
import { Button } from '~/components/ui/button'
import { MORPHO_AUTH_ABI, PERMIT2_ALLOWANCE_TRANSFER_ABI } from '~/lib/abis/bundler3'
import { getBundler3Config, PERMIT2_ADDRESS } from '~/lib/bundler3/addresses'
import { makeBundler3MulticallRequest } from '~/lib/bundler3/multicall'
import { buildOptimizerBundle } from '~/lib/bundler3/optimizer-bundle'
import { useChainedTransactionFlow, waitForTruthy } from '~/lib/transactions/use-chained-transaction-flow'

function fmtToken(amount: bigint, decimals: number, digits = 4): string {
  const asNum = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(asNum))
    return '—'
  return asNum.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export interface BundleOptimizerResultProps {
  displayResult: OptimizeSupplyWithPositionsResult
  chainId: number
  morphoAddress: Address
  userAddress: Address
  userSupplySharesByMarketId: Map<string, bigint>
  loanToken: { address: Address, symbol: string, decimals: number }
  marketMetaById?: Map<string, OptimizerMarketMeta>
  executionGuard?: ExecutionGuard
}

export function BundleOptimizerResult(props: BundleOptimizerResultProps) {
  const { chainId, morphoAddress, userAddress, userSupplySharesByMarketId, displayResult, loanToken, marketMetaById, executionGuard } = props
  const { chain } = useAccount()

  const bundlerCfg = useMemo(() => getBundler3Config(chainId), [chainId])
  const permit2Address = PERMIT2_ADDRESS

  const [permit2Sig, setPermit2Sig] = useState<Hex | undefined>(undefined)
  const [executeError, setExecuteError] = useState<string | undefined>(undefined)
  const [isRunningFlow, setIsRunningFlow] = useState(false)
  const { startFlow, runSignatureStep, runTransactionStep, finishFlow, failFlow: failTransactionFlow, getErrorMessage } = useChainedTransactionFlow()

  // Freeze timestamp per result/token/chain/user so Permit2 typed-data doesn't change after signing.
  const [frozenNowSec, setFrozenNowSec] = useState<bigint>(() => BigInt(Math.floor(Date.now() / 1000)))
  useEffect(() => {
    setFrozenNowSec(BigInt(Math.floor(Date.now() / 1000)))
    setPermit2Sig(undefined)
    setExecuteError(undefined)
  }, [chainId, userAddress, loanToken.address, displayResult])

  // Read Morpho marketParams for each market that will be touched.
  const executeMarketIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of displayResult.positions) {
      if (p.deltaAssets !== 0n && p.destinationKind === 'market')
        ids.add(p.marketId.toLowerCase())
    }
    return [...ids.values()].map(x => x as `0x${string}`)
  }, [displayResult.positions])

  const marketParamsContracts = useMemo(() => {
    if (!bundlerCfg || executeMarketIds.length === 0)
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
    query: { enabled: !!bundlerCfg && marketParamsContracts.length > 0 },
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
    args: bundlerCfg ? [userAddress, bundlerCfg.generalAdapter1] as const : undefined,
    query: { enabled: !!bundlerCfg },
  })
  const isMorphoAuthorized = (isMorphoAuthorizedRead.data ?? false) as boolean

  const permit2AllowanceRead = useReadContract({
    address: permit2Address,
    abi: PERMIT2_ALLOWANCE_TRANSFER_ABI,
    functionName: 'allowance',
    args: bundlerCfg ? [userAddress, loanToken.address, bundlerCfg.generalAdapter1] as const : undefined,
    query: { enabled: !!bundlerCfg },
  })
  const permit2Allowance = useMemo(() => {
    const r: any = permit2AllowanceRead.data
    if (!r)
      return undefined
    if (Array.isArray(r))
      return { amount: BigInt(r[0]), expiration: BigInt(r[1]), nonce: BigInt(r[2]) }
    return { amount: BigInt(r.amount), expiration: BigInt(r.expiration), nonce: BigInt(r.nonce) }
  }, [permit2AllowanceRead.data])

  const tokenAllowanceToPermit2 = useReadContract({
    address: loanToken.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [userAddress, permit2Address] as const,
    query: { enabled: true },
  })

  const bundleBuild = useMemo(() => {
    if (!bundlerCfg)
      return undefined
    return buildOptimizerBundle({
      chainId,
      userAddress,
      marketParamsById,
      userSupplySharesByMarketId,
      positions: displayResult.positions,
      loanToken: loanToken.address,
      nowSec: frozenNowSec,
      permit2Allowance,
      permit2Signature: permit2Sig,
    })
  }, [bundlerCfg, chainId, displayResult.positions, frozenNowSec, loanToken.address, marketParamsById, permit2Allowance, permit2Sig, userAddress, userSupplySharesByMarketId])

  const bundleSummary = bundleBuild && bundleBuild.ok ? bundleBuild.summary : undefined
  const permit2ToSign = bundleBuild && bundleBuild.ok ? bundleBuild.permit2ToSign : undefined

  const resetExecutionState = useCallback(() => {
    setPermit2Sig(undefined)
    setExecuteError(undefined)
    setFrozenNowSec(BigInt(Math.floor(Date.now() / 1000)))
  }, [])

  const needsPermit2TokenApprove = useMemo(() => {
    if (!bundleSummary)
      return false
    if (bundleSummary.depositNeededAssets <= 0n)
      return false
    const allowance = (tokenAllowanceToPermit2.data ?? 0n) as bigint
    return allowance < bundleSummary.depositNeededAssets
  }, [bundleSummary, tokenAllowanceToPermit2.data])

  const { signTypedDataAsync, isPending: isSigningPermit2 } = useSignTypedData()
  const { writeContractAsync, isPending: isWriting } = useWriteContract()

  const optimizerSuccessItems = useMemo<TransactionRecapItem[]>(() => {
    return displayResult.positions
      .filter(position => position.deltaAssets !== 0n)
      .map((position) => {
        const absDelta = position.deltaAssets < 0n ? -position.deltaAssets : position.deltaAssets
        const isWallet = position.destinationKind === 'wallet'
        const meta = isWallet ? undefined : marketMetaById?.get(position.marketId.toLowerCase())
        const title = isWallet
          ? (position.label ?? 'Wallet')
          : (meta?.collateralSymbol ? `${meta.collateralSymbol} / ${loanToken.symbol}` : (position.label ?? `${position.marketId.slice(0, 10)}…${position.marketId.slice(-6)}`))
        return {
          title,
          subtitle: position.deltaAssets >= 0n ? 'Supply increase' : 'Withdraw/reallocate',
          value: `${position.deltaAssets >= 0n ? '+' : '-'}${fmtToken(absDelta, loanToken.decimals)} ${loanToken.symbol}`,
          tone: position.deltaAssets >= 0n ? 'green' : 'orange',
        }
      })
  }, [displayResult.positions, loanToken.decimals, loanToken.symbol, marketMetaById])

  const optimizerFacts = useMemo(() => {
    if (!bundleSummary)
      return []
    return [
      { label: 'Optimized', value: `${fmtToken(bundleSummary.supplyTotalAssets, loanToken.decimals)} ${loanToken.symbol}` },
      { label: 'Wallet used', value: `${fmtToken(bundleSummary.depositNeededAssets, loanToken.decimals)} ${loanToken.symbol}` },
      { label: 'Returned to wallet', value: `${fmtToken(bundleSummary.returnedToWalletAssets, loanToken.decimals)} ${loanToken.symbol}` },
      { label: 'Markets touched', value: String(bundleSummary.marketsTouched) },
    ]
  }, [bundleSummary, loanToken.decimals, loanToken.symbol])

  const multicallRequest = useMemo(() => {
    if (!bundleBuild || !bundleBuild.ok)
      return undefined
    if (!bundleBuild.bundle || bundleBuild.bundle.length === 0)
      return undefined
    return makeBundler3MulticallRequest({
      bundler3: bundleBuild.bundler3,
      bundle: bundleBuild.bundle,
    })
  }, [bundleBuild])

  const multicallSim = useSimulateContract({
    ...(multicallRequest as any),
    query: {
      enabled: !!multicallRequest && !!bundlerCfg && isMorphoAuthorized && !needsPermit2TokenApprove,
    },
  })

  const USDT_MAINNET_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7'
  const isUsdtMainnet = chain?.id === 1 && loanToken.address.toLowerCase() === USDT_MAINNET_ADDRESS
  const USDT_APPROVE_NO_RETURN_ABI = [
    {
      type: 'function',
      name: 'approve',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [],
    },
  ] as const

  const approvePermit2Sim = useSimulateContract({
    address: loanToken.address,
    abi: isUsdtMainnet ? USDT_APPROVE_NO_RETURN_ABI : erc20Abi,
    functionName: 'approve',
    args: [permit2Address, (2n ** 256n) - 1n] as const,
    query: { enabled: needsPermit2TokenApprove },
  })

  const authorizeSim = useSimulateContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'setAuthorization',
    args: bundlerCfg ? [bundlerCfg.generalAdapter1, true] as const : undefined,
    query: { enabled: !!bundlerCfg && !isMorphoAuthorized },
  })

  const latestStateRef = useRef({
    isMorphoAuthorized,
    authorizeRequest: authorizeSim.data?.request,
    needsPermit2TokenApprove,
    approvePermit2Request: approvePermit2Sim.data?.request,
    permit2ToSign,
    multicallRequest: multicallSim.data?.request,
    bundleSummary,
    optimizerFacts,
    optimizerSuccessItems,
  })

  useEffect(() => {
    latestStateRef.current = {
      isMorphoAuthorized,
      authorizeRequest: authorizeSim.data?.request,
      needsPermit2TokenApprove,
      approvePermit2Request: approvePermit2Sim.data?.request,
      permit2ToSign,
      multicallRequest: multicallSim.data?.request,
      bundleSummary,
      optimizerFacts,
      optimizerSuccessItems,
    }
  }, [approvePermit2Sim.data?.request, authorizeSim.data?.request, bundleSummary, isMorphoAuthorized, multicallSim.data?.request, needsPermit2TokenApprove, optimizerFacts, optimizerSuccessItems, permit2ToSign])

  const refreshPrerequisites = useCallback(async () => {
    await Promise.all([
      isMorphoAuthorizedRead.refetch(),
      permit2AllowanceRead.refetch(),
      tokenAllowanceToPermit2.refetch(),
      marketParamsRead.refetch(),
      multicallSim.refetch(),
      approvePermit2Sim.refetch(),
      authorizeSim.refetch(),
    ])
  }, [approvePermit2Sim, authorizeSim, isMorphoAuthorizedRead, marketParamsRead, multicallSim, permit2AllowanceRead, tokenAllowanceToPermit2])

  const requiredStepLabels = useMemo(() => {
    const labels: string[] = []
    if (!isMorphoAuthorized)
      labels.push('Authorize adapter')
    if (needsPermit2TokenApprove)
      labels.push('Approve Permit2')
    if (permit2ToSign)
      labels.push('Sign Permit2')
    labels.push('Execute bundle')
    return labels
  }, [isMorphoAuthorized, needsPermit2TokenApprove, permit2ToSign])

  const canStartFlow = useMemo(() => {
    if (executionGuard?.canExecute === false || !bundleBuild || !bundleBuild.ok || isRunningFlow)
      return false
    if (!isMorphoAuthorized && !authorizeSim.data?.request)
      return false
    if (needsPermit2TokenApprove && !approvePermit2Sim.data?.request)
      return false
    if (!permit2ToSign && !needsPermit2TokenApprove && isMorphoAuthorized && !multicallSim.data?.request)
      return false
    return true
  }, [approvePermit2Sim.data?.request, authorizeSim.data?.request, bundleBuild, executionGuard?.canExecute, isMorphoAuthorized, isRunningFlow, multicallSim.data?.request, needsPermit2TokenApprove, permit2ToSign])

  const onStartExecutionFlow = useCallback(async () => {
    if (!bundlerCfg || !bundleBuild || !bundleBuild.ok)
      return

    setExecuteError(undefined)
    setIsRunningFlow(true)
    setPermit2Sig(undefined)

    const steps = [] as Array<{ key: string, label: string }>
    if (!latestStateRef.current.isMorphoAuthorized) {
      steps.push({ key: 'authorizeWallet', label: 'Confirm adapter authorization in wallet' })
      steps.push({ key: 'authorizeConfirm', label: 'Confirming adapter authorization onchain' })
    }
    if (latestStateRef.current.needsPermit2TokenApprove) {
      steps.push({ key: 'approveWallet', label: 'Confirm Permit2 approval in wallet' })
      steps.push({ key: 'approveConfirm', label: 'Confirming Permit2 approval onchain' })
    }
    if (latestStateRef.current.permit2ToSign)
      steps.push({ key: 'permit2Signature', label: 'Confirm Permit2 signature in wallet' })
    steps.push({ key: 'executeWallet', label: 'Confirm optimizer transaction in wallet' })
    steps.push({ key: 'executeConfirm', label: 'Confirming optimizer execution onchain' })

    const scope = startFlow({
      kind: 'optimizer',
      title: `Optimize ${fmtToken(bundleBuild.summary.supplyTotalAssets, loanToken.decimals)} ${loanToken.symbol}`,
      summary: 'Preparing guided execution',
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
        await refreshPrerequisites()
        await waitForTruthy(() => latestStateRef.current.isMorphoAuthorized ? true : undefined, {
          errorMessage: 'Authorization succeeded but adapter state did not refresh in time',
        })
      }

      if (latestStateRef.current.needsPermit2TokenApprove) {
        const approveRequest = latestStateRef.current.approvePermit2Request
        if (!approveRequest)
          throw new Error('Permit2 approval transaction is not ready yet')
        await runTransactionStep({
          scope,
          walletStepKey: 'approveWallet',
          confirmStepKey: 'approveConfirm',
          chainId,
          walletSummary: `Waiting for ${loanToken.symbol} approval in wallet`,
          confirmSummary: 'Confirming Permit2 approval onchain',
          fallbackError: 'Permit2 approval failed',
          run: () => writeContractAsync(approveRequest as any),
        })
        await refreshPrerequisites()
        await waitForTruthy(() => latestStateRef.current.needsPermit2TokenApprove ? undefined : true, {
          errorMessage: 'Permit2 approval succeeded but allowance did not refresh in time',
        })
      }

      if (latestStateRef.current.permit2ToSign) {
        const nextPermit2 = latestStateRef.current.permit2ToSign
        if (!nextPermit2)
          throw new Error('Permit2 signature is not ready yet')
        const sig = await runSignatureStep({
          scope,
          stepKey: 'permit2Signature',
          waitingSummary: 'Waiting for Permit2 signature',
          fallbackError: 'Permit2 signature failed',
          run: () => signTypedDataAsync(nextPermit2.typedData as any),
        })
        setPermit2Sig(sig as Hex)
        await waitForTruthy(() => latestStateRef.current.multicallRequest, {
          errorMessage: 'Bundle did not become executable after signature',
        })
      }

      const executeRequest = await waitForTruthy(() => latestStateRef.current.multicallRequest, {
        errorMessage: 'Optimizer bundle transaction is not ready yet',
      })
      const finalState = latestStateRef.current
      const txHash = await runTransactionStep({
        scope,
        walletStepKey: 'executeWallet',
        confirmStepKey: 'executeConfirm',
        chainId,
        walletSummary: 'Waiting for optimizer transaction in wallet',
        confirmSummary: 'Confirming optimizer execution onchain',
        fallbackError: 'Optimizer execution failed',
        run: () => writeContractAsync(executeRequest as any),
      })

      finishFlow(scope, {
        title: `Optimized ${fmtToken(finalState.bundleSummary?.supplyTotalAssets ?? 0n, loanToken.decimals)} ${loanToken.symbol}`,
        summary: 'Optimizer execution completed successfully.',
        txHash,
        chainId,
        facts: finalState.optimizerFacts,
        items: finalState.optimizerSuccessItems,
        showModal: true,
      })
      resetExecutionState()
    }
    catch (error) {
      const message = getErrorMessage(error, 'Optimizer execution failed')
      setExecuteError(message)
      failTransactionFlow(scope, message)
    }
    finally {
      setIsRunningFlow(false)
    }
  }, [bundleBuild, bundlerCfg, chainId, failTransactionFlow, finishFlow, getErrorMessage, loanToken.decimals, loanToken.symbol, refreshPrerequisites, resetExecutionState, runSignatureStep, runTransactionStep, signTypedDataAsync, startFlow, writeContractAsync])

  if (!bundlerCfg)
    return null

  return (
    <div className="mt-6 border border-gray-700 rounded-md p-3 bg-gray-900/30 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-200 font-medium">Execute optimization (1 tx)</div>
        <div className="text-xs text-gray-500">via Bundler3</div>
      </div>

      {bundleSummary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Withdraw</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.withdrawTotalAssets, loanToken.decimals)}
              {' '}
              {loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Supply</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.supplyTotalAssets, loanToken.decimals)}
              {' '}
              {loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Wallet used</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.depositNeededAssets, loanToken.decimals)}
              {' '}
              {loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Returned to wallet</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.returnedToWalletAssets, loanToken.decimals)}
              {' '}
              {loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Markets</div>
            <div className="text-gray-100 tabular-nums">{bundleSummary.marketsTouched}</div>
          </div>
        </div>
      )}

      {/* Gating state (debug-friendly) */}
      <div className="text-[11px] text-gray-500">
        authorized=
        {String(isMorphoAuthorized)}
        {' | '}
        needsPermit2Approve=
        {String(needsPermit2TokenApprove)}
        {' | '}
        needsPermit2Sign=
        {String(!!permit2ToSign)}
      </div>

      {requiredStepLabels.length > 1 && (
        <div className="rounded-md border border-gray-800 bg-black/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Guided steps</div>
          <div className="mt-1 text-xs text-gray-300">{requiredStepLabels.join(' → ')}</div>
        </div>
      )}

      {bundleBuild && !bundleBuild.ok && (
        <div className="text-xs text-red-300">
          {bundleBuild.error}
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
          onClick={onStartExecutionFlow}
          disabled={
            !canStartFlow
            || isWriting
            || isSigningPermit2
            || isRunningFlow
          }
        >
          {isWriting || isRunningFlow
            ? 'Waiting…'
            : isSigningPermit2
              ? 'Signing…'
              : requiredStepLabels.length > 1
                ? 'Execute guided flow'
                : 'Execute (1 tx)'}
        </Button>
      </div>
    </div>
  )
}
