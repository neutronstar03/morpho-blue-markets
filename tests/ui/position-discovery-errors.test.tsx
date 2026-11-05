import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Position } from '../../app/pages/home/position'

const state = vi.hoisted(() => ({ directError: false, vaultError: false, retained: false, retry: vi.fn(async () => {}) }))
vi.mock('wagmi', () => ({ useAccount: () => ({ isConnected: true, address: `0x${'0'.repeat(40)}` }) }))
vi.mock('../../app/lib/contexts/viewing-wallet', () => ({ useViewingWallet: () => ({}) }))
vi.mock('../../app/lib/hooks/graphql/use-user-positions', () => ({
  useUserPositionsAcrossChains: () => ({ data: state.retained ? [{ chainId: 1, uniqueKey: 'old' }] : [], isLoading: false, isError: state.directError, refetch: state.retry, dataUpdatedAt: 1 }),
}))
vi.mock('../../app/lib/hooks/graphql/use-vault-v2-adapter-positions', () => ({
  useUserVaultV2PositionChains: () => ({ data: [], isLoading: false, isError: state.vaultError, refetch: state.retry, dataUpdatedAt: 1 }),
}))
vi.mock('../../app/pages/home/position/position-network-section', () => ({ PositionNetworkSection: () => <div>Network positions</div> }))

afterEach(() => {
  cleanup()
  state.directError = false
  state.vaultError = false
  state.retained = false
  vi.clearAllMocks()
  localStorage.clear()
})

describe('position discovery failure UI', () => {
  it('shows true empty only after successful discovery', () => {
    render(<Position />)
    expect(screen.getByText('No open positions')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  for (const source of ['directError', 'vaultError'] as const) {
    it(`does not turn ${source} into an empty wallet or complete totals`, async () => {
      state[source] = true
      render(<Position />)
      expect(screen.getByRole('alert')).toHaveTextContent('Position discovery failed')
      expect(screen.queryByText('No open positions')).toBeNull()
      expect(screen.queryByText('Total Assets')).toBeNull()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry position discovery' }))
      })
      expect(state.retry).toHaveBeenCalledTimes(2)
    })
  }
  it('labels retained data as stale after failed refresh and withholds action rows', () => {
    state.retained = true
    state.directError = true
    render(<Position />)
    expect(screen.getByRole('alert')).toHaveTextContent('Previously loaded data is retained but may be stale')
    expect(screen.queryByText('Network positions')).toBeNull()
  })
})
