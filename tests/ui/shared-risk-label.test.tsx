import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketRiskText } from '../../app/components/ui/market-risk-text'
import { parseSharedDecisions, replaceSharedDecisions } from '../../app/lib/reviews/shared-decisions'
import { useSharedDecisionsPreload } from '../../app/lib/reviews/use-shared-decisions'

const address = '0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c'
const entry = { chainId: 1, collateralAddress: address, decision: 'blacklist', reason: 'Insufficient primary evidence after research', reviewPath: `v1/chain/1/${address}.json` }
afterEach(() => {
  cleanup()
  replaceSharedDecisions([])
  vi.unstubAllGlobals()
})

function Consumer() {
  const query = useSharedDecisionsPreload()
  return (
    <>
      <button onClick={() => query.refetch()}>Refresh decisions</button>
      <MarketRiskText chainId={1} collateralAddress={address}>Pair</MarketRiskText>
    </>
  )
}

describe('published risk labels', () => {
  it('renders monochrome readable outcome, provenance and reason', () => {
    replaceSharedDecisions(parseSharedDecisions({ version: 1, decisions: [entry] }))
    render(<MarketRiskText chainId={1} collateralAddress={address}>Pair</MarketRiskText>)
    expect(screen.getByText('[Blocked]')).toBeInTheDocument()
    expect(screen.getByText(`Dot review: ${entry.reason}`)).toBeInTheDocument()
    expect(screen.getByTitle(entry.reason)).toHaveTextContent('Pair')
  })

  it('keeps persisted exclusions stronger than a later positive review', () => {
    const blocked = '0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055'
    replaceSharedDecisions(parseSharedDecisions({ version: 1, decisions: [{ ...entry, collateralAddress: blocked, decision: 'whitelist', reviewPath: `v1/chain/1/${blocked}.json` }] }))
    render(<MarketRiskText chainId={1} collateralAddress={blocked} status="black">Pair</MarketRiskText>)
    expect(screen.getByText('[Blocked]')).toBeInTheDocument()
    expect(screen.queryByText('[Whitelist]')).toBeNull()
    expect(screen.getByText(/Shared blacklist:.*Resolv/)).toBeInTheDocument()
  })

  it('propagates fresh publication and retains decisions through transport failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, decisions: [entry] })))
      .mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><Consumer /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByText('[Blocked]')).toBeInTheDocument())
    await act(async () => {
      await client.refetchQueries({ queryKey: ['shared-collateral-decisions-v1'] })
    })
    expect(screen.getByText(`Dot review: ${entry.reason}`)).toBeInTheDocument()
  })
})
