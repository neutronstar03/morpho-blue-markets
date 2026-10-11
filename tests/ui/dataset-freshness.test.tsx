import type { DatasetMeta } from '../../app/lib/dataset-cache'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatasetRiskStatus, DatasetRiskStatusView } from '../../app/components/dataset-freshness-status'

const datasetState = vi.hoisted(() => ({ current: null as DatasetMeta | null }))
vi.mock('../../app/lib/collateral-whitelist', () => ({ useCollateralWhitelistDatasetMeta: () => datasetState.current, refreshCollateralWhitelistDataset: vi.fn() }))
vi.mock('../../app/lib/market-blacklist', () => ({ useMarketBlacklistDatasetMeta: () => datasetState.current, refreshMarketBlacklistDataset: vi.fn() }))
vi.mock('../../app/lib/unhealthy-markets', () => ({ useUnhealthyMarketsDatasetMeta: () => datasetState.current, refreshUnhealthyMarketsDataset: vi.fn() }))
vi.mock('../../app/lib/oracle-providers', () => ({ useOracleProvidersDatasetMeta: () => datasetState.current, refreshOracleProvidersDataset: vi.fn() }))

afterEach(() => vi.restoreAllMocks())

const HOUR_MS = 60 * 60 * 1000

function meta(overrides: Partial<DatasetMeta> = {}): DatasetMeta {
  return {
    status: 'loaded',
    source: 'remote',
    refreshing: false,
    observedAtMs: Date.now() - 1000,
    cachedAtMs: null,
    publishedAtMs: null,
    lastCheckedAtMs: Date.now() - 1000,
    freshnessMs: 48 * HOUR_MS,
    nextRetryAtMs: null,
    error: null,
    ...overrides,
  }
}

describe('dataset risk status', () => {
  it('shows a newly completed fetch as fresh before the periodic clock ticks', () => {
    const mountedAt = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(mountedAt)
    datasetState.current = meta({ observedAtMs: mountedAt - 1000 })
    const { rerender } = render(<DatasetRiskStatus />)
    clock.mockReturnValue(mountedAt + 1000)
    datasetState.current = meta({ observedAtMs: mountedAt + 1000 })
    rerender(<DatasetRiskStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('risk data 0s')
    expect(screen.getByRole('status')).not.toHaveTextContent('stale')
  })

  it('shows a stale source/age and refreshes on request', () => {
    const now = Date.now()
    const onRefresh = vi.fn()
    render(
      <DatasetRiskStatusView
        now={now}
        onRefresh={onRefresh}
        datasets={[
          {
            key: 'whitelist',
            label: 'Collateral whitelist',
            meta: meta({ source: 'cache', observedAtMs: now - 100 * HOUR_MS }),
          },
        ]}
      />,
    )

    const status = screen.getByRole('status')
    expect(status.textContent).toMatch(/stale/)
    expect(status.textContent).toMatch(/cache/)

    const refresh = screen.getByRole('button', { name: 'Refresh risk data' })
    fireEvent.click(refresh)
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('labels an unavailable dataset and exposes per-dataset detail', () => {
    const now = Date.now()
    render(
      <DatasetRiskStatusView
        now={now}
        onRefresh={() => {}}
        datasets={[
          { key: 'blacklist', label: 'Market blacklist', meta: meta({ status: 'failed', source: 'none', observedAtMs: null, error: 'Risk data unavailable' }) },
          { key: 'oracle', label: 'Oracle providers', meta: meta({ observedAtMs: now - 1000, freshnessMs: 7 * 24 * HOUR_MS }) },
        ]}
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/unavailable/)
    const trigger = screen.getByRole('button', { name: /risk data status/i })
    expect(trigger.getAttribute('title')).toContain('Market blacklist: unavailable')
  })

  it('reports fresh data with a compact age', () => {
    const now = Date.now()
    render(
      <DatasetRiskStatusView
        now={now}
        onRefresh={() => {}}
        datasets={[
          { key: 'blacklist', label: 'Market blacklist', meta: meta({ observedAtMs: now - 2 * HOUR_MS }) },
        ]}
      />,
    )

    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/^risk data 2h/)
    expect(text).not.toMatch(/stale|unavailable/)
  })

  it('shows a failed refresh even when retained data is still within its freshness window', () => {
    const now = Date.now()
    render(
      <DatasetRiskStatusView
        now={now}
        onRefresh={() => {}}
        datasets={[
          { key: 'oracle', label: 'Oracle providers', meta: meta() },
          { key: 'blacklist', label: 'Market blacklist', meta: meta({ source: 'cache', error: 'Refresh failed', observedAtMs: now - HOUR_MS }) },
        ]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('risk data refresh failed')
    expect(screen.getByRole('button', { name: /risk data status/i })).toHaveAttribute('title', expect.stringContaining('cached 1h'))
  })
})
