import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '~/components/ui/button'
import { trackEvent } from '~/lib/analytics'
import { useTransactionFeedback } from '~/lib/contexts/transaction-feedback.context'
import { getExplorerTransactionUrl } from '~/lib/explorer'
import { cn } from '~/lib/utils'

function statusLabel(status: string) {
  switch (status) {
    case 'awaiting_wallet':
      return 'Waiting for wallet confirmation'
    case 'signing':
      return 'Waiting for signature'
    case 'submitted':
      return 'Transaction submitted'
    case 'confirming':
      return 'Confirming onchain'
    case 'warning':
      return 'Confirmation delayed'
    case 'success':
      return 'Completed successfully'
    case 'error':
      return 'Action failed'
    default:
      return ''
  }
}

export function TransactionDock() {
  const { flow, clearFlow } = useTransactionFeedback()

  // Track transaction outcome transitions (success / error / warning) once per flow.
  const prevStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!flow) {
      prevStatusRef.current = undefined
      return
    }
    if (prevStatusRef.current === flow.status)
      return
    prevStatusRef.current = flow.status

    if (flow.status === 'success') {
      trackEvent('transaction_success', {
        kind: flow.kind,
        chainId: flow.chainId,
      })
    }
    else if (flow.status === 'error') {
      trackEvent('transaction_error', {
        kind: flow.kind,
        chainId: flow.chainId,
        errorMessage: flow.errorMessage?.slice(0, 200),
      })
    }
    else if (flow.status === 'warning') {
      trackEvent('transaction_warning', {
        kind: flow.kind,
        chainId: flow.chainId,
      })
    }
  }, [flow])

  if (!flow)
    return null

  const activeStep = flow.steps.find(step => step.status === 'active')
    ?? flow.steps.find(step => step.status === 'error')
    ?? (flow.status === 'success' || flow.status === 'error' ? undefined : flow.steps[flow.steps.length - 1])
  const explorerUrl = flow.txHash && flow.chainId ? getExplorerTransactionUrl(flow.chainId, flow.txHash) : ''
  const isTerminal = flow.status === 'success' || flow.status === 'error' || flow.status === 'warning'
  const isWarning = flow.status === 'warning'
  const icon = isWarning
    ? <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
    : flow.status === 'error'
      ? <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
      : flow.status === 'success'
        ? <CheckCircleIcon className="h-5 w-5 text-green-400" />
        : <Loader2 className="h-5 w-5 animate-spin text-blue-400" />

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[min(92vw,440px)]">
      <div className="rounded-xl border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-sm">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 shrink-0">
            {icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-100">{flow.title}</div>
                <div className="mt-0.5 text-xs text-gray-400">{flow.summary || statusLabel(flow.status)}</div>
              </div>
              {isTerminal && (
                <button
                  type="button"
                  onClick={() => clearFlow(flow.id)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-100"
                  aria-label="Dismiss transaction feedback"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {activeStep && (
              <div className="mt-3 rounded-md border border-gray-800 bg-black/20 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Current step</div>
                <div className={cn(
                  'mt-1 text-sm',
                  activeStep.status === 'error'
                    ? 'text-red-300'
                    : isWarning
                      ? 'text-amber-200'
                      : 'text-gray-200',
                )}
                >
                  {activeStep.label}
                </div>
              </div>
            )}

            {!!flow.errorMessage && (
              <div className={cn(
                'mt-3 text-sm break-words',
                isWarning ? 'text-amber-300' : 'text-red-300',
              )}
              >
                {flow.errorMessage}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                >
                  View transaction
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {flow.status === 'success' && flow.success?.showModal === false && (
                <Button type="button" variant="outline" size="sm" onClick={() => clearFlow(flow.id)}>
                  Close
                </Button>
              )}
              {isWarning && (
                <Button type="button" variant="outline" size="sm" onClick={() => clearFlow(flow.id)}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
