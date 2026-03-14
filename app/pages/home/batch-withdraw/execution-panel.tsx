import type { BatchWithdrawExecutionState } from './shared'
import { Button } from '~/components/ui/button'

export function BatchWithdrawExecutionPanel({ execution }: { execution: BatchWithdrawExecutionState }) {
  if (!execution.bundlerCfg || !execution.morphoAddress)
    return null

  return (
    <div className="mt-6 border border-gray-700 rounded-md p-3 bg-gray-900/30 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-200 font-medium">Execute withdraw (1 tx)</div>
        <div className="text-xs text-gray-500">via Bundler3</div>
      </div>

      {!execution.isMorphoAuthorized && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-gray-400">
            One-time setup: authorize the Bundler adapter on Morpho (required for withdraws).
          </div>
          <Button onClick={execution.onAuthorizeAdapter} disabled={!execution.authorizeAvailable || execution.isWriting}>
            Authorize
          </Button>
        </div>
      )}

      {execution.multicallError && (
        <div className="text-xs text-red-300">{execution.multicallError}</div>
      )}

      {execution.executeError && (
        <div className="text-xs text-red-300">{execution.executeError}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={execution.onExecuteBundle} disabled={!execution.canExecute}>
          {execution.isWriting ? 'Sending…' : execution.isConfirming ? 'Confirming…' : 'Withdraw (1 tx)'}
        </Button>
      </div>
    </div>
  )
}
