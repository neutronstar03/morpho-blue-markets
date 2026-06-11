import type { EulerRelatedVault, EulerVaultRow } from '~/lib/euler/use-euler-vaults'
import { ArrowDownUp, Ban, ChevronDown, ExternalLink, RefreshCw, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { useEulerVaults } from '~/lib/euler/use-euler-vaults'
import { getExplorerUrl } from '~/lib/explorer'
import { formatBigintShort, formatMarketSize, formatPercent } from '~/lib/formatters'

type SortKey = 'supplyApy' | 'totalAssetsUsd' | 'cashUsd' | 'utilization'
type PerspectiveFilter = 'all' | 'governed' | 'factory' | 'escrow'
type OracleFilter = 'present' | 'all' | 'missing'
type RiskFilter = 'active' | 'all' | 'deprecated'

const DEFAULT_MIN_LIQUIDITY_USD = 2000
const DEFAULT_MIN_SUPPLY_APY = 4

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function eulerVaultUrl(address: string) {
  return `https://app.euler.finance/vault/${address}?network=ethereum`
}

function sortValue(row: EulerVaultRow, sortKey: SortKey) {
  if (sortKey === 'totalAssetsUsd')
    return row.totalAssetsUsd ?? -1
  if (sortKey === 'cashUsd')
    return row.cashUsd ?? -1
  if (sortKey === 'utilization')
    return row.utilization
  return row.supplyApy
}

function perspectiveMatches(row: EulerVaultRow, filter: PerspectiveFilter) {
  if (filter === 'all')
    return true
  if (filter === 'governed')
    return row.perspectives.includes('governedPerspective')
  if (filter === 'escrow')
    return row.perspectives.includes('escrowedCollateralPerspective')
  return row.perspectives.includes('evkFactoryPerspective')
    && !row.perspectives.includes('governedPerspective')
    && !row.perspectives.includes('escrowedCollateralPerspective')
}

function oracleMatches(row: EulerVaultRow, filter: OracleFilter) {
  if (filter === 'all')
    return true
  return filter === 'present' ? row.hasOracle : !row.hasOracle
}

function riskMatches(row: EulerVaultRow, filter: RiskFilter) {
  if (filter === 'all')
    return true
  if (filter === 'deprecated')
    return row.deprecated
  return !row.deprecated
}

function perspectiveBadgeVariant(row: EulerVaultRow) {
  if (row.perspectiveLabel === 'Governed')
    return 'success' as const
  if (row.perspectiveLabel === 'Escrow')
    return 'neutral' as const
  if (row.perspectiveLabel === 'Factory')
    return 'warning' as const
  return 'subtle' as const
}

function isUsefulRelatedVault(vault: EulerRelatedVault) {
  return !vault.deprecated && vault.isSupplyEnabled && vault.utilization > 0 && (vault.totalAssetsUsd ?? 0) > 0
}

function usefulRelatedVaults(vaults: EulerRelatedVault[]) {
  return vaults.filter(isUsefulRelatedVault)
}

function EulerSummary({ visibleRows, rawCount, pricedAssetCount, deprecatedCount, governanceLimitedCount }: {
  visibleRows: EulerVaultRow[]
  rawCount: number
  pricedAssetCount: number
  deprecatedCount: number
  governanceLimitedCount: number
}) {
  const topSupplyApy = visibleRows[0]?.supplyApy
  const totalUsd = visibleRows.reduce((sum, row) => sum + (row.totalAssetsUsd ?? 0), 0)
  const oracleCount = visibleRows.filter(row => row.hasOracle).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="border border-gray-700 bg-gray-900/40 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Visible</div>
        <div className="mt-1 text-lg font-semibold text-white tabular-nums">{visibleRows.length}</div>
        <div className="text-xs text-gray-500 tabular-nums">
          {rawCount}
          {' '}
          indexed
        </div>
      </div>
      <div className="border border-gray-700 bg-gray-900/40 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Metadata</div>
        <div className="mt-1 text-lg font-semibold text-red-300 tabular-nums">{deprecatedCount}</div>
        <div className="text-xs text-gray-500 tabular-nums">
          {governanceLimitedCount}
          {' '}
          governance-limited
        </div>
      </div>
      <div className="border border-gray-700 bg-gray-900/40 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Supply</div>
        <div className="mt-1 text-lg font-semibold text-green-300 tabular-nums">{topSupplyApy != null ? formatPercent(topSupplyApy) : '--'}</div>
        <div className="text-xs text-gray-500">top visible APY</div>
      </div>
      <div className="border border-gray-700 bg-gray-900/40 px-3 py-2">
        <div className="text-xs uppercase text-gray-500">Liquidity</div>
        <div className="mt-1 text-lg font-semibold text-white tabular-nums">{formatMarketSize(totalUsd)}</div>
        <div className="text-xs text-gray-500 tabular-nums">
          {oracleCount}
          {' '}
          with oracle
          {' '}
          /
          {' '}
          {pricedAssetCount}
          {' '}
          priced
        </div>
      </div>
    </div>
  )
}

function RiskFilterNotice({ riskFilter }: { riskFilter: RiskFilter }) {
  if (riskFilter === 'active')
    return null

  if (riskFilter === 'deprecated') {
    return (
      <div className="border-b border-red-800/50 bg-red-950/35 px-4 py-3 text-sm text-red-100">
        Showing deprecated vaults only. These rows are hidden from the default supply-candidate view and should be treated as investigation items, not deposit ideas.
      </div>
    )
  }

  return (
    <div className="border-b border-yellow-800/50 bg-yellow-950/25 px-4 py-3 text-sm text-yellow-100">
      Showing active and deprecated vaults together. Deprecated rows carry Euler metadata warnings and are excluded from related-vault counts.
    </div>
  )
}

function RelatedVaultList({ title, emptyText, rows }: {
  title: string
  emptyText: string
  rows: EulerRelatedVault[]
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase text-gray-500">{title}</div>
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="text-sm text-gray-500">{emptyText}</div>}
        {rows.map(vault => (
          <div key={vault.address} className="grid grid-cols-[minmax(8rem,1fr)_4rem_5rem_7.25rem] items-center gap-3 rounded border border-gray-700 bg-gray-950/50 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-semibold text-white">{vault.assetSymbol}</div>
              <div className="truncate font-mono text-xs text-gray-500">
                {vault.marketName ? `${vault.marketName} / ${vault.symbol}` : vault.symbol}
              </div>
            </div>
            <div className="text-right tabular-nums whitespace-nowrap">
              <div className="text-gray-400">Util</div>
              <div className="text-gray-100">{formatPercent(vault.utilization, 1)}</div>
            </div>
            <div className="text-right tabular-nums whitespace-nowrap">
              <div className="text-gray-400">Total</div>
              <div className="text-gray-100">{vault.totalAssetsUsd != null ? formatMarketSize(vault.totalAssetsUsd) : '--'}</div>
            </div>
            <div className="flex min-w-[7.25rem] justify-end gap-2">
              <a
                href={eulerVaultUrl(vault.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-blue-700/50 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-900/30"
                onClick={event => event.stopPropagation()}
              >
                Euler
              </a>
              <a
                href={getExplorerUrl(1, vault.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-800"
                onClick={event => event.stopPropagation()}
              >
                Scan
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExpandedVaultRow({ row }: { row: EulerVaultRow }) {
  const acceptedCollaterals = usefulRelatedVaults(row.acceptedCollaterals)
  const usedAsCollateralBy = usefulRelatedVaults(row.usedAsCollateralBy)

  return (
    <tr className="bg-gray-900/60">
      <td colSpan={8} className="px-5 py-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_15rem]">
          <RelatedVaultList
            title="Accepts collateral for borrowing this asset"
            emptyText="No active priced collateral vaults after filtering 0% utilization rows."
            rows={acceptedCollaterals}
          />
          <RelatedVaultList
            title="This vault token is collateral in"
            emptyText="No active priced vaults use this vault token as collateral."
            rows={usedAsCollateralBy}
          />
          <div className="space-y-3 rounded border border-gray-700 bg-gray-950/50 p-3">
            {(row.deprecated || row.governanceLimited || row.marketDescription || row.portfolioNotice) && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Euler metadata</div>
                <div className="space-y-2 text-sm text-gray-300">
                  {row.marketName && <div className="font-semibold text-white">{row.marketName}</div>}
                  {row.marketDescription && <div>{row.marketDescription}</div>}
                  {row.portfolioNotice && <div className="text-yellow-200">{row.portfolioNotice}</div>}
                  {row.deprecationReason && <div className="rounded border border-red-800/60 bg-red-950/40 p-2 text-red-200">{row.deprecationReason}</div>}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Vault links</div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={eulerVaultUrl(row.vaultAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-blue-700/50 px-2 py-1 text-xs font-medium text-blue-200 hover:bg-blue-900/30"
                  onClick={event => event.stopPropagation()}
                >
                  Euler UI
                </a>
                <a
                  href={getExplorerUrl(row.chainId, row.vaultAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-800"
                  onClick={event => event.stopPropagation()}
                >
                  Explorer
                </a>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">IRM</div>
              <a
                href={getExplorerUrl(row.chainId, row.interestRateModel)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm font-medium text-gray-300 hover:text-blue-300"
                onClick={event => event.stopPropagation()}
              >
                {row.interestRateModelLabel}
              </a>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Oracle</div>
              <a
                href={getExplorerUrl(row.chainId, row.oracle)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate font-mono text-xs text-gray-300 hover:text-blue-300"
                onClick={event => event.stopPropagation()}
              >
                {shortAddress(row.oracle)}
              </a>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Admin</div>
              <div className="font-mono text-xs text-gray-400">{shortAddress(row.governonAdmin)}</div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

function EulerVaultTable({ rows, isLoading }: { rows: EulerVaultRow[], isLoading: boolean }) {
  const [expandedVault, setExpandedVault] = useState<string | null>(null)

  function toggleExpanded(row: EulerVaultRow) {
    setExpandedVault(prev => prev === row.vaultAddress ? null : row.vaultAddress)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-300">
        Loading...
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        No vaults match the current filters.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-900/60">
          <tr>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-300 sm:px-5">Vault</th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-300">Asset</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-300">Supply APY</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase text-gray-300 sm:table-cell">Total</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-300">Cash</th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase text-gray-300 md:table-cell">Util</th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase text-gray-300">Links</th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-300">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700 bg-gray-800">
          {rows.map((row) => {
            const isExpanded = expandedVault === row.vaultAddress
            const acceptedCollateralCount = usefulRelatedVaults(row.acceptedCollaterals).length
            const usedAsCollateralByCount = usefulRelatedVaults(row.usedAsCollateralBy).length

            return (
              <Fragment key={`${row.chainId}:${row.vaultAddress}`}>
                <tr
                  className={`${isExpanded ? 'bg-gray-700/70' : 'even:bg-white/[0.02]'} cursor-pointer hover:bg-gray-700/70`}
                  onClick={() => toggleExpanded(row)}
                >
                  <td className="px-3 py-4 sm:px-5">
                    <div className="flex min-w-48 items-center gap-2">
                      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      <span className="min-w-0 truncate text-sm font-medium text-white">
                        {row.symbol}
                      </span>
                      <a
                        href={eulerVaultUrl(row.vaultAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-blue-300"
                        onClick={event => event.stopPropagation()}
                        aria-label={`Open ${row.symbol} in Euler`}
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                      </a>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">{row.name}</div>
                    {row.marketName && row.marketName !== row.name && (
                      <div className="mt-1 truncate text-xs text-blue-200/80">{row.marketName}</div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-sm text-gray-200">
                    <div className="font-medium">{row.assetSymbol}</div>
                    {row.assetAddress && (
                      <a
                        href={getExplorerUrl(row.chainId, row.assetAddress)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-gray-500 hover:text-blue-300"
                        onClick={event => event.stopPropagation()}
                      >
                        {shortAddress(row.assetAddress)}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right text-sm text-green-300 tabular-nums">{formatPercent(row.supplyApy)}</td>
                  <td className="hidden px-3 py-4 text-right text-sm text-white tabular-nums sm:table-cell">
                    <div>{row.totalAssetsUsd != null ? formatMarketSize(row.totalAssetsUsd) : '--'}</div>
                    <div className="text-xs text-gray-500">
                      {formatBigintShort(row.totalAssets, row.decimals)}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right text-sm text-white tabular-nums">
                    <div>{row.cashUsd != null ? formatMarketSize(row.cashUsd) : '--'}</div>
                    <div className="text-xs text-gray-500">
                      {formatBigintShort(row.cash, row.decimals)}
                    </div>
                  </td>
                  <td className="hidden px-3 py-4 text-right text-sm text-gray-200 tabular-nums md:table-cell">{formatPercent(row.utilization)}</td>
                  <td className="px-3 py-4 text-right text-sm text-gray-200 tabular-nums">
                    {acceptedCollateralCount}
                    {' '}
                    /
                    {' '}
                    {usedAsCollateralByCount}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge size="sm" variant={perspectiveBadgeVariant(row)}>{row.perspectiveLabel}</Badge>
                      {row.deprecated && (
                        <Badge size="sm" variant="danger">
                          <Ban className="h-3 w-3" />
                          Deprecated
                        </Badge>
                      )}
                      {!row.deprecated && row.governanceLimited && (
                        <Badge size="sm" variant="warning">
                          <TriangleAlert className="h-3 w-3" />
                          Gov limited
                        </Badge>
                      )}
                      <Badge size="sm" variant={row.hasOracle ? 'success' : 'danger'}>
                        {row.hasOracle ? <ShieldCheck className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
                        Oracle
                      </Badge>
                    </div>
                  </td>
                </tr>
                {isExpanded && <ExpandedVaultRow row={row} />}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function EulerVaultExplorer() {
  const { data, isLoading, isFetching, error, refetch } = useEulerVaults()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('supplyApy')
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveFilter>('all')
  const [oracleFilter, setOracleFilter] = useState<OracleFilter>('present')
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('active')
  const [minLiquidityInput, setMinLiquidityInput] = useState(String(DEFAULT_MIN_LIQUIDITY_USD))
  const [minSupplyApyInput, setMinSupplyApyInput] = useState(String(DEFAULT_MIN_SUPPLY_APY))

  const rows = data?.rows ?? []
  const minLiquidityUsd = Number.parseFloat(minLiquidityInput)
  const minSupplyApyPct = Number.parseFloat(minSupplyApyInput)

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const minUsd = Number.isFinite(minLiquidityUsd) ? minLiquidityUsd : DEFAULT_MIN_LIQUIDITY_USD
    const minApy = Number.isFinite(minSupplyApyPct) ? minSupplyApyPct / 100 : 0

    return rows
      .filter(row => row.isSupplyEnabled)
      .filter(row => (row.totalAssetsUsd ?? 0) >= minUsd)
      .filter(row => row.supplyApy >= minApy)
      .filter(row => perspectiveMatches(row, perspectiveFilter))
      .filter(row => oracleMatches(row, oracleFilter))
      .filter(row => riskMatches(row, riskFilter))
      .filter((row) => {
        if (!query)
          return true
        return [
          row.name,
          row.symbol,
          row.marketName ?? '',
          row.marketDescription ?? '',
          row.deprecationReason ?? '',
          row.assetSymbol,
          row.vaultAddress,
          row.assetAddress ?? '',
          ...row.acceptedCollaterals.map(vault => vault.symbol),
          ...row.acceptedCollaterals.map(vault => vault.assetSymbol),
          ...row.usedAsCollateralBy.map(vault => vault.symbol),
          ...row.usedAsCollateralBy.map(vault => vault.assetSymbol),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey))
  }, [minLiquidityUsd, minSupplyApyPct, oracleFilter, perspectiveFilter, riskFilter, rows, searchQuery, sortKey])

  return (
    <div className="space-y-4">
      <EulerSummary
        visibleRows={visibleRows}
        rawCount={data?.rawCount ?? 0}
        pricedAssetCount={data?.pricedAssetCount ?? 0}
        deprecatedCount={data?.deprecatedCount ?? 0}
        governanceLimitedCount={data?.governanceLimitedCount ?? 0}
      />

      <Card className="border border-gray-700 bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-gray-700 bg-gray-900/50 p-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-white">Euler Vaults</h2>
            <div className="mt-1 text-xs text-gray-500">Ethereum mainnet</div>
          </div>

          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search vaults..."
                className="h-9 w-full rounded-md border border-gray-600 bg-gray-700 pl-9 pr-8 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <label className="flex h-9 w-full items-center rounded-md border border-gray-600 bg-gray-700 pl-3 text-sm text-gray-400 focus-within:ring-2 focus-within:ring-blue-500 sm:w-32">
              Min $
              <input
                type="number"
                min="0"
                step="100"
                value={minLiquidityInput}
                onChange={event => setMinLiquidityInput(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white placeholder:text-gray-400 focus:outline-none"
              />
            </label>

            <label className="flex h-9 w-full items-center rounded-md border border-gray-600 bg-gray-700 pl-3 text-sm text-gray-400 focus-within:ring-2 focus-within:ring-blue-500 sm:w-36">
              Min APY
              <input
                type="number"
                min="0"
                step="0.1"
                value={minSupplyApyInput}
                onChange={event => setMinSupplyApyInput(event.target.value)}
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white placeholder:text-gray-500 focus:outline-none"
              />
              <span className="pr-2 text-gray-500">%</span>
            </label>

            <Select value={perspectiveFilter} onValueChange={value => setPerspectiveFilter(value as PerspectiveFilter)}>
              <SelectTrigger className="h-9 min-w-32 border-gray-600 bg-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="governed">Governed</SelectItem>
                <SelectItem value="factory">Factory-only</SelectItem>
                <SelectItem value="escrow">Escrow</SelectItem>
              </SelectContent>
            </Select>

            <Select value={oracleFilter} onValueChange={value => setOracleFilter(value as OracleFilter)}>
              <SelectTrigger className="h-9 min-w-32 border-gray-600 bg-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Oracle</SelectItem>
                <SelectItem value="all">All oracles</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={riskFilter} onValueChange={value => setRiskFilter(value as RiskFilter)}>
              <SelectTrigger className="h-9 min-w-32 border-gray-600 bg-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="all">All risk</SelectItem>
                <SelectItem value="deprecated">Deprecated only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortKey} onValueChange={value => setSortKey(value as SortKey)}>
              <SelectTrigger className="h-9 min-w-36 border-gray-600 bg-gray-700 text-white">
                <ArrowDownUp className="h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supplyApy">Supply APY</SelectItem>
                <SelectItem value="totalAssetsUsd">Total USD</SelectItem>
                <SelectItem value="cashUsd">Cash USD</SelectItem>
                <SelectItem value="utilization">Utilization</SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isFetching}
              onClick={() => refetch()}
              aria-label="Refresh Euler vaults"
            >
              {!isFetching && <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="border-b border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error instanceof Error ? error.message : 'Failed to load Euler vaults.'}
          </div>
        )}

        <RiskFilterNotice riskFilter={riskFilter} />

        <EulerVaultTable rows={visibleRows} isLoading={isLoading} />
      </Card>
    </div>
  )
}
