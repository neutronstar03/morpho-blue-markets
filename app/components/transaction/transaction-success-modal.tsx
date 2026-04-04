import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { ExternalLink } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useTransactionFeedback } from '~/lib/contexts/transaction-feedback.context'
import { getExplorerTransactionUrl } from '~/lib/explorer'

const toneClassName = {
  default: 'text-gray-200',
  green: 'text-green-300',
  orange: 'text-orange-300',
} as const

export function TransactionSuccessModal() {
  const { flow, isSuccessModalOpen, dismissSuccessModal, clearFlow } = useTransactionFeedback()

  if (!isSuccessModalOpen || !flow?.success)
    return null

  const { success } = flow
  const explorerUrl = success.txHash && success.chainId ? getExplorerTransactionUrl(success.chainId, success.txHash) : ''

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-success-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        <div className="border-b border-gray-800 px-5 py-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-green-400" />
            <div className="min-w-0 flex-1">
              <div id="tx-success-title" className="text-lg font-semibold text-white">{success.title}</div>
              {success.summary && <div className="mt-1 text-sm text-gray-300">{success.summary}</div>}
            </div>
          </div>
        </div>

        <div className="space-y-5 px-5 py-4">
          {!!success.facts?.length && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {success.facts.map(fact => (
                <div key={`${fact.label}:${fact.value}`} className="rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                  <div className="text-xs text-gray-500">{fact.label}</div>
                  <div className="mt-1 text-sm font-medium text-gray-100">{fact.value}</div>
                </div>
              ))}
            </div>
          )}

          {!!success.items?.length && (
            <div>
              <div className="mb-2 text-sm font-medium text-gray-200">Details</div>
              <div className="space-y-2">
                {success.items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex items-start justify-between gap-4 rounded-lg border border-gray-800 bg-black/20 px-3 py-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-100">{item.title}</div>
                      {item.subtitle && <div className="mt-0.5 text-xs text-gray-400">{item.subtitle}</div>}
                    </div>
                    {item.value && (
                      <div className={`shrink-0 text-sm font-medium ${toneClassName[item.tone ?? 'default']}`}>
                        {item.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200"
              >
                View transaction
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dismissSuccessModal()
                clearFlow(flow.id)
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
