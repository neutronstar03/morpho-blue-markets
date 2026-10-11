import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkProvider } from '../../app/lib/contexts/network'
import { AdvancedList } from '../../app/pages/home/advanced-list/index'

const STABLE_CHAIN_ID = 988
const ETHEREUM_CHAIN_ID = 1
const MARKET_UNIQUE_KEY = `0x${'ab'.repeat(32)}`
const LOAN_ADDRESS = '0x0000000000000000000000000000000000000001'
const COLLATERAL_ADDRESS = '0x0000000000000000000000000000000000000002'
const ORACLE_ADDRESS = '0x0000000000000000000000000000000000000003'
const IRM_ADDRESS = '0x0000000000000000000000000000000000000004'
const LLTV = '860000000000000000'
const RATE_AT_TARGET = 1_267_000_000n

// Mutable wallet state shared with the wagmi mock. hoisted so the mock factory
// (evaluated before this module's top-level constants) can see it.
const wallet = vi.hoisted(() => ({
  chainId: undefined as number | undefined,
}))

// Mocked eth_call layer: one Morpho market read plus its IRM rateAtTarget read.
function readContractsResult(args: { contracts?: Array<{ functionName?: string, chainId?: number }> }) {
  const contracts = args?.contracts ?? []
  if (contracts.length === 0)
    return { data: undefined, isLoading: false }

  if (contracts.some(contract => contract.chainId !== STABLE_CHAIN_ID))
    return { data: contracts.map(() => ({ status: 'failure', error: new Error('Wrong RPC chain') })), isLoading: false }

  if (contracts[0]?.functionName === 'market') {
    return {
      data: contracts.map(() => ({
        status: 'success',
        result: [
          1_000_000_000n, // totalSupplyAssets
          1_000_000_000n, // totalSupplyShares
          800_000_000n, // totalBorrowAssets
          800_000_000n, // totalBorrowShares
          BigInt(Math.floor(Date.now() / 1000)) - 3_600n, // lastUpdate
          0n, // fee
        ],
      })),
      isLoading: false,
    }
  }

  return {
    data: contracts.map(() => ({ status: 'success', result: RATE_AT_TARGET })),
    isLoading: false,
  }
}

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useAccount: () => ({
      address: undefined,
      chainId: wallet.chainId,
      isConnected: wallet.chainId != null,
    }),
    useReadContracts: (args: { contracts?: Array<{ functionName?: string, chainId?: number }> }) => readContractsResult(args),
    useSwitchChain: () => ({ switchChain: vi.fn() }),
  }
})

vi.mock('~/lib/hooks/graphql/use-list-markets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/lib/hooks/graphql/use-list-markets')>()
  return {
    ...actual,
    useMarkets: () => ({
      data: {
        markets: {
          items: [
            {
              marketId: MARKET_UNIQUE_KEY,
              uniqueKey: MARKET_UNIQUE_KEY,
              lltv: LLTV,
              oracleAddress: ORACLE_ADDRESS,
              irmAddress: IRM_ADDRESS,
              morphoBlue: { chain: { id: STABLE_CHAIN_ID } },
              loanAsset: { address: LOAN_ADDRESS, symbol: 'USDC', decimals: 6 },
              collateralAsset: { address: COLLATERAL_ADDRESS, symbol: 'msY', decimals: 18 },
              state: {
                supplyAssets: '1000000000',
                borrowAssets: '800000000',
                borrowApy: 0.06,
                utilization: 0.8,
                supplyAssetsUsd: 1_000_000,
                borrowAssetsUsd: 800_000,
                dailyPriceVariation: 0,
                netSupplyApy: 0.04,
                avgNetSupplyApy: 0.04,
                dailyNetSupplyApy: 0.04,
                weeklyNetSupplyApy: 0.04,
                netBorrowApy: 0.06,
                avgNetBorrowApy: 0.06,
                dailyNetBorrowApy: 0.06,
                weeklyNetBorrowApy: 0.06,
              },
              listed: true,
              supplyingVaults: [],
              supplyingVaultV2s: [],
              creationTimestamp: '0',
            },
          ],
        },
      },
      isLoading: false,
      refetch: vi.fn(async () => undefined),
      dataUpdatedAt: Date.now(),
    }),
  }
})

vi.mock('~/lib/market-risk/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/lib/market-risk/hooks')>()
  return {
    ...actual,
    useMarketRiskStatusMapWithCollateralReviews: () => ({}),
  }
})

// Filters render Radix selects; irrelevant to the APR column and jsdom-hostile.
vi.mock('~/pages/home/advanced-list/market-filters', () => ({
  MarketFilters: () => null,
}))

// The ?react svgr asset is a build-time transform, not available under Vitest.
vi.mock('~/assets/link-new-window.svg?react', () => ({
  default: () => null,
}))

function renderAdvancedList() {
  return render(
    <NetworkProvider>
      <MemoryRouter>
        <AdvancedList />
      </MemoryRouter>
    </NetworkProvider>,
  )
}

function immediateAprText() {
  const label = screen.getByText('msY/USDC')
  const row = label.closest('tr')
  if (!row)
    throw new Error('market row not found')
  const cells = row.querySelectorAll('td')
  return cells[cells.length - 1]?.textContent ?? ''
}

afterEach(() => {
  window.localStorage.clear()
  wallet.chainId = undefined
})

describe('selected-chain immediate APR', () => {
  beforeEach(() => {
    window.localStorage.setItem('use-ls:advanced-list:chainFilter', JSON.stringify('Stable'))
  })

  it('loads the selected-chain APR while the wallet is disconnected', () => {
    wallet.chainId = undefined
    renderAdvancedList()

    expect(screen.getByText('msY/USDC')).toBeInTheDocument()
    expect(immediateAprText()).toMatch(/^\d+\.\d{2}%$/)
  })

  it('loads the selected-chain APR even when the wallet is on another chain', () => {
    wallet.chainId = ETHEREUM_CHAIN_ID
    renderAdvancedList()

    expect(immediateAprText()).toMatch(/^\d+\.\d{2}%$/)
  })

  it('keeps the ALL filter unavailable with no connected wallet', () => {
    window.localStorage.clear()
    wallet.chainId = undefined
    renderAdvancedList()

    expect(immediateAprText()).toBe('—')
  })
})
