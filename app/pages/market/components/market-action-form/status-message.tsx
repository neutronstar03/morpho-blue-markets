import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid'

interface SuccessMessageProps {
  message: string
  onDismiss: () => void
}

export function SuccessMessage({ message, onDismiss }: SuccessMessageProps) {
  return (
    <div className="bg-green-950/30 border border-green-800/40 rounded-lg p-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <CheckCircleIcon className="h-5 w-5 text-green-400" aria-hidden="true" />
        </div>
        <div className="ml-3">
          <p className="text-sm font-medium text-green-300">{message}</p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              onClick={onDismiss}
              className="inline-flex rounded-md p-1.5 text-green-400 hover:bg-green-900/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-green-950 focus:ring-green-600"
            >
              <span className="sr-only">Dismiss</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface InlineNoticeProps {
  tone: 'yellow' | 'green' | 'red'
  children: React.ReactNode
}

const toneClassName = {
  yellow: 'bg-yellow-950/30 border-yellow-800/40 text-yellow-300',
  green: 'bg-green-950/30 border-green-800/40 text-green-300',
  red: 'bg-red-950/30 border-red-800/40 text-red-300',
} satisfies Record<InlineNoticeProps['tone'], string>

export function InlineNotice({ tone, children }: InlineNoticeProps) {
  return (
    <div className={`border rounded-lg p-3 ${toneClassName[tone]}`}>
      <p className="text-sm">{children}</p>
    </div>
  )
}
