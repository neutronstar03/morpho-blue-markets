import { useUpdateAvailable } from '../lib/hooks/use-update-available'
import { Button } from './ui/button'

export function UpdateAvailableToast() {
  const { isAvailable, latestSha, refresh, dismiss } = useUpdateAvailable({ pollIntervalMs: 60_000 })

  if (!isAvailable)
    return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,520px)]">
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl px-4 py-3 flex items-start gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-100">Update available</div>
          <div className="text-sm text-gray-300">A new version was deployed. Refresh to update.</div>
          {latestSha && (
            <div className="mt-1 text-xs text-gray-400 tabular-nums">
              New:
              {' '}
              {latestSha.slice(0, 7)}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" onClick={refresh} size="sm" className="shrink-0">
            Refresh
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
