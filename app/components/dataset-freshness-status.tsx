import type { DatasetFreshness, DatasetFreshnessLevel, DatasetMeta, DatasetSource } from '~/lib/dataset-cache'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { refreshCollateralWhitelistDataset, useCollateralWhitelistDatasetMeta } from '~/lib/collateral-whitelist'
import { classifyDatasetFreshness, formatDatasetAge } from '~/lib/dataset-cache'
import { refreshMarketBlacklistDataset, useMarketBlacklistDatasetMeta } from '~/lib/market-blacklist'
import { refreshOracleProvidersDataset, useOracleProvidersDatasetMeta } from '~/lib/oracle-providers'
import { refreshUnhealthyMarketsDataset, useUnhealthyMarketsDatasetMeta } from '~/lib/unhealthy-markets'

export interface RiskDatasetStatus {
  key: string
  label: string
  meta: DatasetMeta
}

interface ClassifiedDataset extends RiskDatasetStatus {
  freshness: DatasetFreshness
}

const LEVEL_SEVERITY: Record<DatasetFreshnessLevel, number> = {
  fresh: 0,
  pending: 1,
  stale: 2,
  unavailable: 3,
}

const SOURCE_LABEL: Record<DatasetSource, string> = {
  local: 'local',
  remote: 'remote',
  cache: 'cache',
  none: 'none',
}

function worstEntry(datasets: ClassifiedDataset[]): ClassifiedDataset | null {
  const severity = (entry: ClassifiedDataset) => LEVEL_SEVERITY[entry.freshness.level] * 2 + (entry.meta.error ? 1 : 0)
  let worst: ClassifiedDataset | null = null
  for (const dataset of datasets) {
    if (!worst || severity(dataset) > severity(worst)
      || (severity(dataset) === severity(worst)
        && (dataset.freshness.ageMs ?? 0) > (worst.freshness.ageMs ?? 0))) {
      worst = dataset
    }
  }
  return worst
}

function summaryLabel(worst: ClassifiedDataset | null): string {
  if (!worst)
    return 'risk data'
  const { level, ageMs, source } = worst.freshness
  if (level === 'unavailable')
    return 'risk data unavailable'
  if (level === 'pending')
    return 'risk data loading'
  if (level === 'stale')
    return `risk data stale ${formatDatasetAge(ageMs)} (${SOURCE_LABEL[source]})`
  if (worst.meta.error)
    return 'risk data refresh failed'
  return `risk data ${formatDatasetAge(ageMs)}`
}

function summaryTone(worst: ClassifiedDataset | null): string {
  if (worst?.meta.error)
    return 'text-orange-300/80'
  switch (worst?.freshness.level) {
    case 'unavailable':
      return 'text-orange-300/80'
    case 'stale':
      return 'text-yellow-300/70'
    case 'pending':
      return 'text-blue-300/70'
    default:
      return 'text-gray-500'
  }
}

function describeDataset(entry: ClassifiedDataset): string {
  const { level, ageMs, source } = entry.freshness
  if (level === 'unavailable')
    return 'unavailable'
  if (level === 'pending')
    return 'loading'
  const ageLabel = source === 'cache' ? 'cached' : 'checked'
  const refreshLabel = entry.meta.error ? ' · refresh failed' : entry.meta.refreshing ? ' · refreshing' : ''
  return `${level} · ${SOURCE_LABEL[source]} · ${ageLabel} ${formatDatasetAge(ageMs)}${refreshLabel}`
}

interface DatasetRiskStatusViewProps {
  datasets: RiskDatasetStatus[]
  now: number
  onRefresh: () => void
}

export function DatasetRiskStatusView({ datasets, now, onRefresh }: DatasetRiskStatusViewProps) {
  const classified = useMemo(
    () => datasets.map(dataset => ({ ...dataset, freshness: classifyDatasetFreshness(dataset.meta, now) })),
    [datasets, now],
  )
  const worst = worstEntry(classified)
  const label = summaryLabel(worst)
  const tone = summaryTone(worst)
  const detail = worst
    ? `${worst.label}: ${describeDataset(worst)}`
    : 'No risk datasets configured'

  return (
    <span className="inline-flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`font-mono text-[10px] leading-none tabular-nums ${tone} rounded px-1 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}
            title={detail}
            aria-label={`Risk data status: ${detail}`}
          >
            <span role="status">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-72 text-xs">
          <p className="mb-2 font-medium text-gray-200">Risk data</p>
          <ul className="space-y-1">
            {classified.map(entry => (
              <li key={entry.key} className="flex items-center justify-between gap-3">
                <span className="text-gray-300">{entry.label}</span>
                <span className="font-mono text-[10px] text-gray-400">{describeDataset(entry)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-gray-500">Age is time since a successful fetch or cache write.</p>
          {classified.filter(entry => entry.meta.publishedAtMs !== null).map(entry => (
            <p key={`${entry.key}:published`} className="mt-1 text-gray-500">
              {entry.label}
              : content dated
              {new Date(entry.meta.publishedAtMs!).toLocaleString()}
            </p>
          ))}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh risk data"
        disabled={datasets.some(entry => entry.meta.refreshing || entry.meta.status === 'loading')}
        className="inline-flex items-center gap-1 rounded px-1 text-[10px] leading-none text-gray-400 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        <span>Refresh</span>
      </button>
    </span>
  )
}

export function DatasetRiskStatus() {
  const whitelist = useCollateralWhitelistDatasetMeta()
  const blacklist = useMarketBlacklistDatasetMeta()
  const unhealthy = useUnhealthyMarketsDatasetMeta()
  const oracle = useOracleProvidersDatasetMeta()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const datasets = useMemo<RiskDatasetStatus[]>(() => [
    { key: 'whitelist', label: 'Collateral whitelist', meta: whitelist },
    { key: 'blacklist', label: 'Market blacklist', meta: blacklist },
    { key: 'unhealthy', label: 'Unhealthy markets', meta: unhealthy },
    { key: 'oracle', label: 'Oracle providers', meta: oracle },
  ], [whitelist, blacklist, unhealthy, oracle])

  const onRefresh = useCallback(() => {
    refreshCollateralWhitelistDataset()
    refreshMarketBlacklistDataset()
    refreshUnhealthyMarketsDataset()
    refreshOracleProvidersDataset()
  }, [])

  // A fetch can complete between the periodic clock ticks. Use the render time
  // too so newly acquired data is not mistaken for a future-dated cache.
  return <DatasetRiskStatusView datasets={datasets} now={Math.max(now, Date.now())} onRefresh={onRefresh} />
}
