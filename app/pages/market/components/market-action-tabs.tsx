import type { KeyboardEvent, ReactNode } from 'react'
import { useId } from 'react'

type Action = 'deposit' | 'withdraw'
export function MarketActionTabs({ value, onChange, supplyBlocked, supplyPanel, withdrawPanel }: {
  value: Action
  onChange: (value: Action) => void
  supplyBlocked: boolean
  supplyPanel: ReactNode
  withdrawPanel: ReactNode
}) {
  const id = useId()
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')]
    const current = tabs.indexOf(event.target as HTMLButtonElement)
    const index = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    tabs[index]?.focus()
    tabs[index]?.click()
  }
  return (
    <>
      <div role="tablist" aria-label="Market action" onKeyDown={onKeyDown} className="mb-4 flex gap-2 sm:mb-6 sm:gap-3">
        <button
          type="button"
          role="tab"
          id={`${id}-deposit-tab`}
          aria-controls={`${id}-deposit-panel`}
          aria-selected={value === 'deposit'}
          tabIndex={value === 'deposit' && !supplyBlocked ? 0 : -1}
          disabled={supplyBlocked}
          onClick={() => onChange('deposit')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${supplyBlocked ? 'bg-gray-800 text-gray-400 cursor-not-allowed' : value === 'deposit' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'}`}
        >
          Supply
        </button>
        <button
          type="button"
          role="tab"
          id={`${id}-withdraw-tab`}
          aria-controls={`${id}-withdraw-panel`}
          aria-selected={value === 'withdraw'}
          tabIndex={value === 'withdraw' || supplyBlocked ? 0 : -1}
          onClick={() => onChange('withdraw')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${value === 'withdraw' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'}`}
        >
          Withdraw
        </button>
      </div>
      <div role="tabpanel" id={`${id}-deposit-panel`} aria-labelledby={`${id}-deposit-tab`} hidden={value !== 'deposit'} tabIndex={0} className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        {value === 'deposit' && supplyPanel}
      </div>
      <div role="tabpanel" id={`${id}-withdraw-panel`} aria-labelledby={`${id}-withdraw-tab`} hidden={value !== 'withdraw'} tabIndex={0} className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
        {value === 'withdraw' && withdrawPanel}
      </div>
    </>
  )
}
