import type { Address, Hex } from 'viem'
import type { OptimizerMarketMeta } from './supply-apr-optimizer/shared'
import type { TransactionRecapItem } from '~/lib/contexts/transaction-feedback.types'
import type { ExecutionGuard } from '~/lib/market-risk/types'
import type { OptimizeSupplyWithPositionsResult } from '~/lib/optimizer/supply-optimizer'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { erc20Abi, formatUnits } from 'viem'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useSignTypedData,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { Button } from '~/components/ui/button'
import { MORPHO_AUTH_ABI, PERMIT2_ALLOWANCE_TRANSFER_ABI } from '~/lib/abis/bundler3'
import { getBundler3Config, PERMIT2_ADDRESS } from '~/lib/bundler3/addresses'
import { makeBundler3MulticallRequest } from '~/lib/bundler3/multicall'
import { buildOptimizerBundle } from '~/lib/bundler3/optimizer-bundle'
import { useTransactionFeedback } from '~/lib/contexts/transaction-feedback.context'

type OptimizerAction = 'authorize' | 'approvePermit2' | 'signPermit2' | 'executeBundle' | null

interface OptimizerTrackingState {
  action: Exclude<OptimizerAction, null>
  flowId: string
  attemptId: string
  baselineHash?: `0x${string}`
  trackedHash?: `0x${string}`
}

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
  const [tracking, setTracking] = useState<OptimizerTrackingState | null>(null)
  const { beginFlow, completeFlow, failFlow, setStatus, setStepStatus, setTxHash } = useTransactionFeedback()

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
    setTracking(null)
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
  const { writeContract, isPending: isWriting, data: txHash, error: writeError } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: tracking?.trackedHash })

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

  // After any tx completes, refresh the reads so gating updates immediately.
  useEffect(() => {
    if (!receipt.isSuccess)
      return
    isMorphoAuthorizedRead.refetch()
    permit2AllowanceRead.refetch()
    tokenAllowanceToPermit2.refetch()
    marketParamsRead.refetch()
  }, [receipt.isSuccess])

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

  const onSignPermit2 = async () => {
    setExecuteError(undefined)
    setPermit2Sig(undefined)
    if (!permit2ToSign)
      return
    const scope = beginFlow({
      kind: 'permit2Sign',
      title: `Sign Permit2 for ${fmtToken(permit2ToSign.depositNeededAssets, loanToken.decimals)} ${loanToken.symbol}`,
      summary: 'Waiting for wallet signature',
      chainId,
      steps: [{ key: 'signature', label: 'Confirm signature in wallet' }],
    })
    setTracking({ action: 'signPermit2', ...scope })
    setStatus(scope, 'signing', 'Waiting for Permit2 signature')
    try {
      const sig = await signTypedDataAsync(permit2ToSign.typedData as any)
      setPermit2Sig(sig as Hex)
      setStepStatus(scope, 'signature', 'completed')
      completeFlow(scope, {
        title: 'Permit2 signature ready',
        summary: 'You can now execute the optimizer bundle.',
        chainId,
        showModal: false,
      })
      setTracking(null)
    }
    catch (e: any) {
      const message = e?.shortMessage ?? e?.message ?? 'Permit2 signature failed'
      setExecuteError(message)
      failFlow(scope, message)
      setTracking(null)
    }
  }

  const onExecuteBundle = () => {
    setExecuteError(undefined)
    if (!multicallSim.data?.request)
      return
    const scope = beginFlow({
      kind: 'optimizer',
      title: `Optimize ${fmtToken(bundleSummary?.supplyTotalAssets ?? 0n, loanToken.decimals)} ${loanToken.symbol}`,
      summary: 'Confirm in wallet to submit optimizer transaction',
      chainId,
      steps: [
        { key: 'wallet', label: 'Confirm optimizer transaction in wallet' },
        { key: 'confirm', label: 'Confirming onchain' },
      ],
    })
    setTracking({ action: 'executeBundle', baselineHash: txHash, ...scope })
    writeContract(multicallSim.data.request)
  }

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

  const onApprovePermit2 = () => {
    setExecuteError(undefined)
    if (!approvePermit2Sim.data?.request)
      return
    const scope = beginFlow({
      kind: 'approval',
      title: `Approve Permit2 for ${loanToken.symbol}`,
      summary: 'Confirm token approval in wallet',
      chainId,
      steps: [
        { key: 'wallet', label: 'Confirm approval in wallet' },
        { key: 'confirm', label: 'Confirming onchain' },
      ],
    })
    setTracking({ action: 'approvePermit2', baselineHash: txHash, ...scope })
    writeContract(approvePermit2Sim.data.request as any)
  }

  const authorizeSim = useSimulateContract({
    address: morphoAddress,
    abi: MORPHO_AUTH_ABI,
    functionName: 'setAuthorization',
    args: bundlerCfg ? [bundlerCfg.generalAdapter1, true] as const : undefined,
    query: { enabled: !!bundlerCfg && !isMorphoAuthorized },
  })

  const onAuthorizeAdapter = () => {
    setExecuteError(undefined)
    if (!authorizeSim.data?.request)
      return
    const scope = beginFlow({
      kind: 'authorization',
      title: 'Authorize Morpho adapter',
      summary: 'Confirm authorization in wallet',
      chainId,
      steps: [
        { key: 'wallet', label: 'Confirm authorization in wallet' },
        { key: 'confirm', label: 'Confirming onchain' },
      ],
    })
    setTracking({ action: 'authorize', baselineHash: txHash, ...scope })
    writeContract(authorizeSim.data.request as any)
  }

  useEffect(() => {
    if (!tracking || tracking.action === 'signPermit2' || tracking.trackedHash || !txHash || txHash === tracking.baselineHash)
      return
    setTracking(current => current && current.action !== 'signPermit2' ? { ...current, trackedHash: txHash } : current)
    setTxHash({ flowId: tracking.flowId, attemptId: tracking.attemptId }, txHash, chainId)
    setStepStatus({ flowId: tracking.flowId, attemptId: tracking.attemptId }, 'wallet', 'completed')
    setStepStatus({ flowId: tracking.flowId, attemptId: tracking.attemptId }, 'confirm', 'active')
    setStatus({ flowId: tracking.flowId, attemptId: tracking.attemptId }, 'confirming', 'Confirming onchain')
  }, [chainId, setStatus, setStepStatus, setTxHash, tracking, txHash])

  useEffect(() => {
    if (!tracking || !writeError)
      return
    const message = (writeError as any)?.shortMessage ?? (writeError as any)?.message ?? 'Transaction failed'
    setExecuteError(message)
    failFlow({ flowId: tracking.flowId, attemptId: tracking.attemptId }, message)
    setTracking(null)
  }, [failFlow, tracking, writeError])

  useEffect(() => {
    if (!tracking || !receipt.error)
      return
    const message = (receipt.error as any)?.shortMessage ?? (receipt.error as any)?.message ?? 'Transaction confirmation failed'
    setExecuteError(message)
    failFlow({ flowId: tracking.flowId, attemptId: tracking.attemptId }, message)
    setTracking(null)
  }, [failFlow, receipt.error, tracking])

  useEffect(() => {
    if (!tracking || !tracking.trackedHash || !receipt.isSuccess)
      return
    if (tracking.action === 'authorize') {
      completeFlow({ flowId: tracking.flowId, attemptId: tracking.attemptId }, {
        title: 'Morpho adapter authorized',
        summary: 'You can now continue with optimizer execution.',
        txHash: tracking.trackedHash,
        chainId,
        showModal: false,
      })
    }
    else if (tracking.action === 'approvePermit2') {
      completeFlow({ flowId: tracking.flowId, attemptId: tracking.attemptId }, {
        title: `Permit2 approved for ${loanToken.symbol}`,
        summary: 'You can now continue with optimizer execution.',
        txHash: tracking.trackedHash,
        chainId,
        showModal: false,
      })
    }
    else if (tracking.action === 'executeBundle') {
      completeFlow({ flowId: tracking.flowId, attemptId: tracking.attemptId }, {
        title: `Optimized ${fmtToken(bundleSummary?.supplyTotalAssets ?? 0n, loanToken.decimals)} ${loanToken.symbol}`,
        summary: 'Optimizer execution completed successfully.',
        txHash: tracking.trackedHash,
        chainId,
        facts: optimizerFacts,
        items: optimizerSuccessItems,
        showModal: true,
      })
      resetExecutionState()
      return
    }
    setTracking(null)
  }, [bundleSummary, chainId, completeFlow, loanToken.decimals, loanToken.symbol, optimizerFacts, optimizerSuccessItems, receipt.isSuccess, resetExecutionState, tracking])

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

      {needsPermit2TokenApprove && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            One-time setup: approve Permit2 for
            {' '}
            {loanToken.symbol}
            {' '}
            (required to pull wallet deposit).
          </div>
          <Button onClick={onApprovePermit2} disabled={!approvePermit2Sim.data?.request || isWriting}>
            Approve Permit2
          </Button>
        </div>
      )}

      {permit2ToSign && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            Sign Permit2 to allow spending
            {' '}
            {fmtToken(permit2ToSign.depositNeededAssets, loanToken.decimals)}
            {' '}
            {loanToken.symbol}
            {' '}
            for this bundle.
          </div>
          <Button onClick={onSignPermit2} disabled={isSigningPermit2 || isWriting}>
            {isSigningPermit2 ? 'Signing…' : 'Sign Permit2'}
          </Button>
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
          onClick={onExecuteBundle}
          disabled={
            executionGuard?.canExecute === false || !multicallSim.data?.request
            || !bundleBuild
            || !bundleBuild.ok
            || !isMorphoAuthorized
            || needsPermit2TokenApprove
            || isWriting
            || receipt.isLoading
          }
        >
          {isWriting ? 'Sending…' : receipt.isLoading ? 'Confirming…' : 'Execute (1 tx)'}
        </Button>
      </div>
    </div>
  )
}
