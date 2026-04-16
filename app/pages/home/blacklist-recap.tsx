import { ExternalLink, X } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { getSupportedChainName } from '~/lib/addresses'
import { getExplorerUrl } from '~/lib/explorer'
import {
  clearCollateralLocallyBlacklisted,
  listLocallyBlacklistedCollaterals,
  useLocalCollateralBlacklistVersion,
} from '~/lib/local-collateral-blacklist'
import {
  clearCollateralDecision,
  listCollateralDecisions,
} from '~/lib/market-risk/collateral-decisions'
import { useCollateralDecisionsVersion } from '~/lib/market-risk/hooks'

interface BlacklistRecapRow {
  kind: 'local_blacklist' | 'manual_ban'
  reasonLabel: string
  chainId: number
  collateralAddress: string
  ts: number
  symbol?: string
  name?: string
}

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatSavedAt(ts: number) {
  if (!Number.isFinite(ts) || ts <= 0)
    return 'Unknown date'
  try {
    return new Date(ts).toLocaleString()
  }
  catch {
    return 'Unknown date'
  }
}

function buildBlacklistRecapRows(): BlacklistRecapRow[] {
  const localBlacklistRows = listLocallyBlacklistedCollaterals().map(entry => ({
    kind: 'local_blacklist' as const,
    reasonLabel: 'User Blacklist',
    chainId: entry.chainId,
    collateralAddress: entry.collateralAddress,
    ts: entry.ts,
    symbol: entry.symbol,
    name: entry.name,
  }))
  const manualBanRows = listCollateralDecisions()
    .filter(entry => entry.decision === 'ban')
    .map(entry => ({
      kind: 'manual_ban' as const,
      reasonLabel: 'Unsafe asset',
      chainId: entry.chainId,
      collateralAddress: entry.collateralAddress,
      ts: entry.ts,
      symbol: entry.symbol,
      name: entry.name,
    }))

  return [...localBlacklistRows, ...manualBanRows].sort((a, b) => b.ts - a.ts)
}

function ReasonBadge({ kind, label }: { kind: BlacklistRecapRow['kind'], label: string }) {
  return (
    <span className={kind === 'local_blacklist'
      ? 'inline-flex rounded-full border border-red-700/30 bg-red-900/10 px-2 py-0.5 text-[11px] font-medium text-red-300'
      : 'inline-flex rounded-full border border-orange-700/30 bg-orange-900/10 px-2 py-0.5 text-[11px] font-medium text-orange-300'}
    >
      {label}
    </span>
  )
}

export function BlacklistRecap({ onClose }: { onClose: () => void }) {
  const localBlacklistVersion = useLocalCollateralBlacklistVersion()
  const decisionsVersion = useCollateralDecisionsVersion()

  const rows = useMemo(() => {
    void localBlacklistVersion
    void decisionsVersion
    return buildBlacklistRecapRows()
  }, [decisionsVersion, localBlacklistVersion])

  const onRemove = (row: BlacklistRecapRow) => {
    if (row.kind === 'local_blacklist') {
      clearCollateralLocallyBlacklisted(row.chainId, row.collateralAddress)
      return
    }
    clearCollateralDecision(row.chainId, row.collateralAddress)
  }

  return (
    <Card className="border border-gray-700 bg-gray-800">
      <div className="border-b border-gray-700 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white">Blacklist recap</h2>
            <p className="text-xs text-gray-400 sm:text-sm">
              User-managed hidden collaterals from local blacklist and manual ban actions.
            </p>
            <div className="mt-3 text-xs text-gray-500 sm:text-sm">
              {rows.length}
              {' '}
              {rows.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 shrink-0 border-gray-600 px-0 text-gray-300 hover:bg-gray-700/50"
            aria-label="Hide blacklist recap"
            title="Hide blacklist recap"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!rows.length
        ? (
            <div className="p-4 text-sm text-gray-400">
              No local blacklisted collaterals or manual bans yet.
            </div>
          )
        : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-800/80">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Token</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Chain</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Reason</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Address</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300">Saved at</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 bg-gray-800/40">
                    {rows.map((row) => {
                      const explorerUrl = getExplorerUrl(row.chainId, row.collateralAddress as `0x${string}`)
                      return (
                        <tr key={`${row.kind}:${row.chainId}:${row.collateralAddress}`} className="even:bg-white/[0.02] transition-colors hover:bg-gray-700/50">
                          <td className="px-6 py-4 align-top text-sm text-white">
                            <div className="min-w-0">
                              <div className="font-medium text-white">{row.symbol || formatAddress(row.collateralAddress)}</div>
                              <div className="mt-1 whitespace-nowrap text-sm text-gray-300">{row.name || 'Unknown token'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-gray-300">{getSupportedChainName(row.chainId)}</td>
                          <td className="px-6 py-4 align-top text-sm text-gray-300">
                            <ReasonBadge kind={row.kind} label={row.reasonLabel} />
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-gray-400">
                            <div className="flex items-start gap-2">
                              <span className="font-mono text-xs" title={row.collateralAddress}>{row.collateralAddress}</span>
                              {explorerUrl && (
                                <a
                                  href={explorerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-0.5 shrink-0 text-gray-400 transition-colors hover:text-blue-400"
                                  title="Open in explorer"
                                  aria-label="Open token address in explorer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-gray-300">{formatSavedAt(row.ts)}</td>
                          <td className="px-6 py-4 text-right align-top">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onRemove(row)}
                              className="whitespace-nowrap border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20"
                            >
                              Enable Asset
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-gray-700 lg:hidden">
                {rows.map((row) => {
                  const explorerUrl = getExplorerUrl(row.chainId, row.collateralAddress as `0x${string}`)
                  return (
                    <div key={`${row.kind}:${row.chainId}:${row.collateralAddress}`} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-white">{row.symbol || formatAddress(row.collateralAddress)}</div>
                          <div className="mt-1 text-sm text-gray-300">{row.name || 'Unknown token'}</div>
                        </div>
                        <ReasonBadge kind={row.kind} label={row.reasonLabel} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                        <span>{getSupportedChainName(row.chainId)}</span>
                        <span>{formatSavedAt(row.ts)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-xs break-all text-gray-400">{row.collateralAddress}</span>
                          {explorerUrl && (
                            <a
                              href={explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 shrink-0 text-gray-400 transition-colors hover:text-blue-400"
                              title="Open in explorer"
                              aria-label="Open token address in explorer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="whitespace-nowrap border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20"
                          onClick={() => onRemove(row)}
                        >
                          Enable Asset
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
    </Card>
  )
}
