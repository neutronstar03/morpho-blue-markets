import type { Address } from 'viem'
import type { OptimizerMarketMeta } from './supply-apr-optimizer/shared'
import type { ExecutionGuard } from '~/lib/market-risk/types'
import type { OptimizeSupplyWithPositionsResult } from '~/lib/optimizer/supply-optimizer'
import { formatUnits } from 'viem'
import { Button } from '~/components/ui/button'
import { useBundleOptimizerExecution } from './use-bundle-optimizer-execution'

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
  onExecutedSuccess?: () => void
}

export function BundleOptimizerResult(props: BundleOptimizerResultProps) {
  const {
    bundlerCfg,
    bundleBuild,
    bundleSummary,
    requiredStepLabels,
    canStartFlow,
    isMorphoAuthorized,
    needsPermit2TokenApprove,
    permit2ToSign,
    multicallSim,
    executeError,
    isWriting,
    isSigningPermit2,
    isRunningFlow,
    onStartExecutionFlow,
  } = useBundleOptimizerExecution(props)

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
              {fmtToken(bundleSummary.withdrawTotalAssets, props.loanToken.decimals)}
              {' '}
              {props.loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Supply</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.supplyTotalAssets, props.loanToken.decimals)}
              {' '}
              {props.loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Wallet used</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.depositNeededAssets, props.loanToken.decimals)}
              {' '}
              {props.loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Returned to wallet</div>
            <div className="text-gray-100 tabular-nums">
              {fmtToken(bundleSummary.returnedToWalletAssets, props.loanToken.decimals)}
              {' '}
              {props.loanToken.symbol}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1">
            <div className="text-gray-400">Markets</div>
            <div className="text-gray-100 tabular-nums">{bundleSummary.marketsTouched}</div>
          </div>
        </div>
      )}

      <div className="text-[11px] text-gray-500">
        authorized=
        {String(isMorphoAuthorized)}
        {' '}
        {' | '}
        needsPermit2Approve=
        {String(needsPermit2TokenApprove)}
        {' '}
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
        <div className="text-xs text-red-300">{bundleBuild.error}</div>
      )}

      {multicallSim.error && (
        <div className="text-xs text-red-300">
          {((multicallSim.error as any)?.shortMessage ?? (multicallSim.error as any)?.message ?? 'Simulation failed')}
        </div>
      )}

      {executeError && (
        <div className="text-xs text-red-300">{executeError}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={onStartExecutionFlow}
          disabled={!canStartFlow || isWriting || isSigningPermit2 || isRunningFlow}
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
