import { AlertTriangle, Eye, Filter, Minus, Plus, Power, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'

interface AdvancedSettingsProps {
  onClose: () => void
  onShowBlacklistRecap: () => void
}

export function AdvancedSettings({ onClose, onShowBlacklistRecap }: AdvancedSettingsProps) {
  const disabled = useHomeMagicOptimizerStore(state => state.disabled)
  const setDisabled = useHomeMagicOptimizerStore(state => state.setDisabled)
  const clearAllOpportunities = useHomeMagicOptimizerStore(state => state.clearAllOpportunities)
  const clearScan = useHomeMagicOptimizerStore(state => state.clearScan)

  const [skipThreshold, setSkipThreshold] = useLocalStorage<string>('supply-apr-optimizer:skip-threshold', '0.25')

  const onToggleMagicOptimizer = () => {
    const next = !disabled
    setDisabled(next)
    if (next) {
      clearAllOpportunities()
      clearScan()
    }
  }

  const onWipeCache = () => {
    try {
      window.localStorage.clear()
    }
    catch { /* ignore storage errors and still refresh */ }
    window.location.reload()
  }

  return (
    <Card className="border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white">Advanced settings</h2>
            <p className="text-xs text-gray-400 sm:text-sm">
              Power-user controls for the home page.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 shrink-0 border-gray-600 px-0 text-gray-300 hover:bg-gray-700/50"
            aria-label="Close advanced settings"
            title="Close advanced settings"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="divide-y divide-gray-700">
        {/* Disable Magic Optimizer */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Power className="h-5 w-5 shrink-0 mt-0.5 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Disable Magic Optimizer</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Stop background scanning and hide opportunity cards.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={disabled}
            onClick={onToggleMagicOptimizer}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 ${disabled ? 'bg-red-600' : 'bg-gray-600'}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${disabled ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {/* Skip optimization threshold */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Filter className="h-5 w-5 shrink-0 mt-0.5 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Skip optimization threshold</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Optimizer will not start a rebalance if the APR improvement is less than the threshold.
              </p>
            </div>
          </div>
          <div className="shrink-0 self-end md:self-auto flex flex-col items-end">
            <div className="grid h-10 w-40 md:w-48 grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border border-gray-700 bg-gray-900">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-full rounded-none border-0 border-r border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => {
                  const current = Number.parseFloat(skipThreshold ?? '0.25')
                  if (!Number.isFinite(current) || current <= 0)
                    return
                  const next = Math.max(0, Math.round((current - 0.25) * 100) / 100)
                  setSkipThreshold(String(next))
                }}
                aria-label="Decrease skip optimization threshold"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={skipThreshold ?? ''}
                  onChange={e => setSkipThreshold(e.target.value)}
                  placeholder="0.25"
                  className="h-full rounded-none border-0 px-2 text-center tabular-nums text-white placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Skip optimization threshold percent"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-full rounded-none border-0 border-l border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => {
                  const current = Number.parseFloat(skipThreshold ?? '0.25')
                  const next = Math.min(10, Math.round(((Number.isFinite(current) ? current : 0.25) + 0.25) * 100) / 100)
                  setSkipThreshold(String(next))
                }}
                aria-label="Increase skip optimization threshold"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">Default: 0.25%</p>
          </div>
        </div>

        {/* Show Blacklist Recap */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Eye className="h-5 w-5 shrink-0 mt-0.5 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Show Blacklist recap</p>
              <p className="text-xs text-gray-400 mt-0.5">
                View and manage locally blacklisted collaterals.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onShowBlacklistRecap}
            className="shrink-0 border-gray-600 text-gray-200 hover:bg-gray-700/50"
          >
            Show
          </Button>
        </div>

        {/* Wipe local cache & reload */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-orange-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Wipe local cache &amp; reload</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Clear all locally stored data and refresh the page.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onWipeCache}
            className="shrink-0 border-red-700/50 text-red-300 hover:bg-red-700/20 hover:text-red-200"
          >
            Wipe
          </Button>
        </div>
      </div>
    </Card>
  )
}
