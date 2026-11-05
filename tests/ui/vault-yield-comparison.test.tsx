import type { SupplyVaultData } from '../../app/lib/graphql/vault-aprs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SupplyAprOptimizerProvider, useSupplyAprOptimizer } from '../../app/lib/contexts/optimizer.context'
import { SupplyAprOptimizer } from '../../app/pages/home/supply-apr-optimizer'
import { VaultYieldComparison } from '../../app/pages/home/supply-apr-optimizer/vault-yield-comparison'

const state = vi.hoisted(() => ({ live: vi.fn() }))
vi.mock('../../app/lib/graphql/vault-aprs', () => ({ fetchSupplyVaults: (...args: unknown[]) => state.live(...args) }))
vi.mock('../../app/pages/home/supply-apr-optimizer/use-supply-apr-optimizer-controller', () => ({
  useSupplyAprOptimizerController: () => ({ ctx: useSupplyAprOptimizer(), userAddress: undefined, optimizerChainId: 1, optimizerChainName: 'Ethereum', selectedOption: { address: `0x${'b'.repeat(40)}`, symbol: 'USDC' }, topMarketsQuery: {} }),
}))
const asset = `0x${'b'.repeat(40)}`
const vault: SupplyVaultData = { address: `0x${'a'.repeat(40)}`, name: 'USDC reference vault', symbol: 'V', whitelisted: true, chain: { id: 1 }, asset: { address: asset, symbol: 'USDC', decimals: 6 }, avgNetApy: 0.05, liquidityUsd: 100_000, version: 'v2' }
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}><SupplyAprOptimizerProvider>{children}</SupplyAprOptimizerProvider></QueryClientProvider>
}
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it('real optimizer caller does not fetch when collapsed or only expanded; compares selected asset on explicit activation', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ vaults: [vault] })))
  vi.stubGlobal('fetch', fetcher)
  state.live.mockResolvedValue([vault, { ...vault, name: 'Other asset', asset: { ...vault.asset, address: `0x${'c'.repeat(40)}` } }, { ...vault, name: 'Wrong chain', chain: { id: 10 } }])
  render(<SupplyAprOptimizer />, { wrapper })
  expect(fetcher).not.toHaveBeenCalled()
  expect(state.live).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand Supply APR optimizer' })[0])
  expect(fetcher).not.toHaveBeenCalled()
  expect(state.live).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Compare vault yields' }))
  await screen.findByText('USDC reference vault')
  expect(screen.queryByText('Other asset')).toBeNull()
  expect(screen.queryByText('Wrong chain')).toBeNull()
  expect(screen.getByText('5%')).toBeInTheDocument()
  expect(screen.getByText(/does not change the optimizer/)).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(state.live).toHaveBeenCalledTimes(1)
  expect(state.live.mock.calls[0][0]).toEqual([1])
  fireEvent.click(screen.getByRole('button', { name: 'Hide vault yields' }))
  expect(screen.queryByRole('table')).toBeNull()
})
it('shows cache provenance while live is pending, then empty success; changing chains scopes the next live request', async () => {
  let finish!: (data: SupplyVaultData[]) => void
  state.live.mockImplementation(() => new Promise<SupplyVaultData[]>((resolve) => {
    finish = resolve
  }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ vaults: [vault] }))))
  const view = render(<VaultYieldComparison chainId={1} chainName="Ethereum" assetAddress={asset} />, { wrapper })
  fireEvent.click(screen.getByRole('button', { name: 'Compare vault yields' }))
  await screen.findByText('Cached vault data; refreshing live data.')
  await act(async () => finish([]))
  await screen.findByText('No matching eligible vaults in the loaded data.')
  view.rerender(<VaultYieldComparison chainId={10} chainName="Optimism" assetAddress={asset} />)
  await waitFor(() => expect(state.live.mock.calls.at(-1)?.[0]).toEqual([10]))
  expect(screen.queryByText('USDC reference vault')).toBeNull()
})
it('reports a live failure and retries without pretending the vault list is empty', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
  state.live.mockRejectedValue(new Error('Contract unavailable'))
  render(<VaultYieldComparison chainId={1} chainName="Ethereum" />, { wrapper })
  fireEvent.click(screen.getByRole('button', { name: 'Compare vault yields' }))
  await screen.findByRole('alert')
  expect(screen.queryByText(/No matching eligible vaults/)).toBeNull()
  state.live.mockResolvedValue([vault])
  fireEvent.click(screen.getByRole('button', { name: 'Retry live vault data' }))
  await screen.findByText('USDC reference vault')
})
