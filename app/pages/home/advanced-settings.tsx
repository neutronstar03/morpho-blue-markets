// Renders home-page power-user controls, including local blacklist sync setup.
import { AlertTriangle, Cloud, Eye, Filter, Power, X } from 'lucide-react'
import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { StepperInput } from '~/components/ui/stepper-input'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import {
  createUserBlacklistSyncMessage,
  disableUserBlacklistSyncOnDevice,
  enableUserBlacklistSync,
  syncUserBlacklistNow,
  useUserBlacklistSync,
} from '~/lib/user-blacklist-sync'

interface AdvancedSettingsProps {
  onClose: () => void
  onShowBlacklistRecap: () => void
}

export function AdvancedSettings({ onClose, onShowBlacklistRecap }: AdvancedSettingsProps) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const syncState = useUserBlacklistSync(address)
  const [syncActionError, setSyncActionError] = useState<string>()
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

  const onEnableBlacklistSync = async () => {
    if (!address)
      return
    setSyncActionError(undefined)
    try {
      // The user signs once, then the backend returns a token for silent sync on this device.
      const message = createUserBlacklistSyncMessage(address)
      const signature = await signMessageAsync({ message })
      await enableUserBlacklistSync(address, message, signature)
    }
    catch (error) {
      setSyncActionError(error instanceof Error ? error.message : 'Failed to enable blacklist sync')
    }
  }

  const onSyncBlacklistNow = async () => {
    if (!address)
      return
    setSyncActionError(undefined)
    try {
      await syncUserBlacklistNow(address)
    }
    catch (error) {
      setSyncActionError(error instanceof Error ? error.message : 'Failed to sync blacklist')
    }
  }

  const onDisableBlacklistSync = () => {
    if (!address)
      return
    disableUserBlacklistSyncOnDevice(address)
    setSyncActionError(undefined)
  }

  const syncStatusText = syncState.error ?? syncActionError ?? (syncState.lastSyncAt ? `Last sync: ${new Date(syncState.lastSyncAt).toLocaleString()}` : 'Not synced yet')

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
            <StepperInput
              className="w-40 md:w-48"
              value={skipThreshold ?? ''}
              onChange={setSkipThreshold}
              onDecrement={() => {
                const current = Number.parseFloat(skipThreshold ?? '0.25')
                if (!Number.isFinite(current) || current <= 0)
                  return
                const next = Math.max(0, Math.round((current - 0.25) * 100) / 100)
                setSkipThreshold(String(next))
              }}
              onIncrement={() => {
                const current = Number.parseFloat(skipThreshold ?? '0.25')
                const next = Math.min(10, Math.round(((Number.isFinite(current) ? current : 0.25) + 0.25) * 100) / 100)
                setSkipThreshold(String(next))
              }}
              canDecrement={Number.parseFloat(skipThreshold ?? '0.25') > 0}
              placeholder="0.25"
              ariaLabel="Skip optimization threshold percent"
              suffix="%"
              inputClassName="px-2"
            />
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

        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Blacklist sync</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {syncState.enabled
                  ? `Synced for ${address?.slice(0, 6)}...${address?.slice(-4)}. ${syncStatusText}`
                  : 'Save local blacklist and lost-value market actions across this wallet\'s devices. Requires one wallet signature per device.'}
              </p>
              {(syncState.error || syncActionError) && (
                <p className="mt-1 text-xs text-orange-300">{syncState.error ?? syncActionError}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {syncState.enabled
              ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onSyncBlacklistNow}
                      disabled={syncState.busy}
                      className="border-gray-600 text-gray-200 hover:bg-gray-700/50"
                    >
                      {syncState.busy ? 'Syncing...' : 'Sync now'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onDisableBlacklistSync}
                      disabled={syncState.busy}
                      className="border-gray-600 text-gray-200 hover:bg-gray-700/50"
                    >
                      Disable on this device
                    </Button>
                  </>
                )
              : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onEnableBlacklistSync}
                    disabled={!isConnected || !address || syncState.busy}
                    className="border-gray-600 text-gray-200 hover:bg-gray-700/50"
                  >
                    {syncState.busy ? 'Enabling...' : 'Enable sync'}
                  </Button>
                )}
          </div>
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
