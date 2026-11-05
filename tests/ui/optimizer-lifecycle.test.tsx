import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Profiler, useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupplyAprOptimizerProvider, useSupplyAprOptimizer } from '../../app/lib/contexts/optimizer.context'
import { HomeMagicOptimizerEffects } from '../../app/lib/home-magic-optimizer-effects'
import { MarketFreshnessLabel } from '../../app/pages/home/advanced-list/market-freshness-label'
import { SupplyAprOptimizer } from '../../app/pages/home/supply-apr-optimizer'

const requests = vi.hoisted(() => ({ manual: vi.fn(async () => []), scan: vi.fn(async () => []) }))
vi.mock('../../app/lib/hooks/use-home-magic-optimizer-scan', () => ({
  useHomeMagicOptimizerScan: () => useQuery({ queryKey: ['scan-positions'], queryFn: requests.scan, refetchInterval: 1000 }),
}))
vi.mock('../../app/pages/home/supply-apr-optimizer/use-supply-apr-optimizer-controller', () => ({
  useSupplyAprOptimizerController: () => {
    const ctx = useSupplyAprOptimizer()
    useQuery({ queryKey: ['manual-positions'], queryFn: requests.manual, refetchInterval: 1000 })
    return { ctx, ownedLoanAssetOptions: [], hasSomethingToClear: !!ctx.selection.loanAssetAddress }
  },
}))
vi.mock('../../app/pages/home/supply-apr-optimizer/optimizer-form', () => ({ SupplyAprOptimizerForm: () => null }))
vi.mock('../../app/pages/home/supply-apr-optimizer/optimizer-results', () => ({ SupplyAprOptimizerResults: () => null }))

function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/')}>Home</button>
}

function SavedSelection() {
  const ctx = useSupplyAprOptimizer()
  useEffect(() => {
    ctx.setSelection({ loanAssetAddress: 'saved-token' })
  }, [ctx.setSelection])
  return <output>{ctx.selection.loanAssetAddress}</output>
}

function setup(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SupplyAprOptimizerProvider>
          <HomeMagicOptimizerEffects />
          <Navigation />
          <SupplyAprOptimizer />
          <SavedSelection />
        </SupplyAprOptimizerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  window.localStorage?.clear()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('optimizer request owners', () => {
  it('mounts neither scan nor hidden manual queries on detail; starts scan on home', async () => {
    setup('/market/example/1')
    expect(requests.manual).not.toHaveBeenCalled()
    expect(requests.scan).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Home' }))
    await act(async () => {})
    expect(requests.scan).toHaveBeenCalledTimes(1)
    expect(requests.manual).not.toHaveBeenCalled()
  })

  it('initializes manual queries only on expansion and preserves saved selection across collapse', async () => {
    vi.useFakeTimers()
    setup('/')
    await act(async () => {})
    expect(requests.scan).toHaveBeenCalledTimes(1)
    expect(requests.manual).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Expand Supply APR optimizer' })[0])
    await act(async () => {})
    expect(requests.manual).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse Supply APR optimizer' })[0])
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    expect(requests.manual).toHaveBeenCalledTimes(1)
    expect(requests.scan.mock.calls.length).toBeGreaterThan(1)
    expect(screen.getByText('saved-token')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Expand Supply APR optimizer' })[0])
    await act(async () => {})
    expect(requests.manual).toHaveBeenCalledTimes(1)
    expect(screen.getByText('saved-token')).toBeInTheDocument()
  })
})

describe('freshness updates', () => {
  it('updates the label without committing unchanged rows; filters still render', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
    const commits = vi.fn()
    function Table({ filter }: { filter: string }) {
      return <Profiler id="rows" onRender={commits}><div>{filter}</div></Profiler>
    }
    function List({ filter }: { filter: string }) {
      return (
        <>
          <MarketFreshnessLabel dataUpdatedAt={Date.now() - 1000} />
          <Table filter={filter} />
        </>
      )
    }
    const view = render(<List filter="All rows" />)
    const before = screen.getByText('just now').textContent
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText(/ago/).textContent).not.toBe(before)
    expect(commits).toHaveBeenCalledTimes(1)
    view.rerender(<List filter="Filtered rows" />)
    expect(commits).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Filtered rows')).toBeInTheDocument()
  })
})
