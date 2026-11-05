import type { ReactNode } from 'react'
import type { SupplyVaultData } from '../../app/lib/graphql/vault-aprs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMarketAprByVaults } from '../../app/lib/hooks/graphql/use-market-apr-by-vaults'

const state = vi.hoisted(() => ({ live: vi.fn() }))
vi.mock('../../app/lib/graphql/vault-aprs', () => ({ fetchSupplyVaults: (...args: unknown[]) => state.live(...args) }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
const vault: SupplyVaultData = { address: `0x${'a'.repeat(40)}`, name: 'Vault', symbol: 'V', whitelisted: true, chain: { id: 1 }, asset: { address: `0x${'b'.repeat(40)}`, symbol: 'USDC', decimals: 6 }, avgNetApy: 0.1, liquidityUsd: 100_000, version: 'v2' }
function setup(chains = [1]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return renderHook(() => useMarketAprByVaults(chains), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}
it('shows an edge placeholder and replaces it with live data using the same eligibility rules', async () => {
  let resolveLive!: (data: SupplyVaultData[]) => void
  state.live.mockImplementation(() => new Promise<SupplyVaultData[]>((resolve) => {
    resolveLive = resolve
  }))
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ vaults: [vault, { ...vault, address: `0x${'c'.repeat(40)}`, avgNetApy: 0.01 }] })))
  vi.stubGlobal('fetch', fetcher)
  const { result } = setup()
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(true))
  expect(result.current.data?.eligibleVaults).toHaveLength(1)
  expect(result.current.data?.effectiveByChainId.get(1)?.effectiveAvgNetApy).toBe(0.1)
  await act(async () => resolveLive([{ ...vault, avgNetApy: 0.2 }]))
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
  expect(result.current.data?.effectiveByChainId.get(1)?.effectiveAvgNetApy).toBe(0.2)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(state.live.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
})
it('an edge failure leaves the direct query available', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
  state.live.mockResolvedValue([vault])
  const { result } = setup()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data?.eligibleVaults).toHaveLength(1)
})
it('an empty chain selection mounts neither request', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  setup([])
  expect(fetcher).not.toHaveBeenCalled()
  expect(state.live).not.toHaveBeenCalled()
})
