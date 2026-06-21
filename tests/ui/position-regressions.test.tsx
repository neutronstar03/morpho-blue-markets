import type { LiveMarketPosition } from '../../app/lib/morpho/live-position'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fetchUserPositions } from '../../app/lib/hooks/graphql/use-user-positions'
import { fetchUserVaultV2Positions } from '../../app/lib/hooks/graphql/use-vault-v2-adapter-positions'
import { setMarketLocallyMarkedLostValue } from '../../app/lib/local-market-exclusions'
import { isVisibleDirectMarketPosition, isVisiblePositionRow, isVisibleVaultV2Position } from '../../app/pages/home/position/position-utils'
import { VaultV2PositionList } from '../../app/pages/home/position/vault-v2-position-list'

const PRIVATE_POSITION_WALLET = process.env.MBM_PRIVATE_POSITION_TEST_WALLET
const MAINNET_CHAIN_ID = 1
const MSY_USDC_MARKET_ID = '0x23a7d0ff682b323363fb8ba58327ed87001f6306e09b7fd7413bbe4698e749c8'

function positionWithPrincipalUsd(principalUsd: number, overrides: Partial<LiveMarketPosition> = {}): LiveMarketPosition {
  return {
    market: {
      uniqueKey: overrides.market?.uniqueKey ?? `0x${'1'.repeat(64)}`,
      irmAddress: `0x${'2'.repeat(40)}`,
      loanAsset: {
        symbol: 'USDC',
        decimals: 6,
        address: `0x${'3'.repeat(40)}`,
      },
      collateralAsset: {
        symbol: 'dust',
        decimals: 18,
        address: `0x${'4'.repeat(40)}`,
      },
      state: {
        netSupplyApy: 0,
        utilization: 0,
        supplyAssets: '1000000',
        supplyShares: '1',
        supplyAssetsUsd: principalUsd,
      },
    },
    source: overrides.source,
    userState: {
      supplyShares: 1n,
      borrowShares: 0n,
      collateral: 0n,
    },
    liveState: {
      suppliedAssets: 1n,
    },
  }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('position regressions', () => {
  it.runIf(PRIVATE_POSITION_WALLET)('discovers the private direct msY/USDC position through the app query path', async () => {
    const positions = await fetchUserPositions(PRIVATE_POSITION_WALLET!, MAINNET_CHAIN_ID)
    const msYPosition = positions.find(position => position.market.uniqueKey.toLowerCase() === MSY_USDC_MARKET_ID)

    expect(msYPosition).toBeDefined()
    expect(msYPosition?.source?.kind).toBe('direct')
    expect(msYPosition?.market.collateralAsset.symbol).toBe('msY')
    expect(msYPosition?.market.loanAsset.symbol).toBe('USDC')
    expect(BigInt(msYPosition?.state.supplyShares ?? '0')).toBeGreaterThan(0n)
  }, 30_000)

  it.runIf(PRIVATE_POSITION_WALLET)('keeps full Vault V2 rows additive for the same private wallet', async () => {
    const positions = await fetchUserVaultV2Positions(PRIVATE_POSITION_WALLET!, MAINNET_CHAIN_ID)

    expect(positions.some(position => position.source?.kind === 'vaultV2')).toBe(true)
    expect(positions.some(position => position.source?.vaultSymbol === 'sdFRXUSDv2')).toBe(true)
    expect(positions.every(position => isVisibleVaultV2Position(position, { minSupplyUsd: 1 }))).toBe(true)
  }, 30_000)

  it('hides supply-only dust below one dollar', () => {
    expect(isVisiblePositionRow(positionWithPrincipalUsd(0.5), { minSupplyUsd: 1 })).toBe(false)
    expect(isVisiblePositionRow(positionWithPrincipalUsd(1), { minSupplyUsd: 1 })).toBe(true)
  })

  it('hides only locally marked lost-value direct market rows', () => {
    const position = positionWithPrincipalUsd(10)

    expect(isVisibleDirectMarketPosition(position, { chainId: MAINNET_CHAIN_ID, minSupplyUsd: 1 })).toBe(true)

    setMarketLocallyMarkedLostValue(MAINNET_CHAIN_ID, position.market.uniqueKey)

    expect(isVisibleDirectMarketPosition(position, { chainId: MAINNET_CHAIN_ID, minSupplyUsd: 1 })).toBe(false)
  })

  it('classifies Vault V2 rows separately from direct market rows', () => {
    const position = positionWithPrincipalUsd(10, {
      market: {
        uniqueKey: 'vault-v2:0x5555555555555555555555555555555555555555',
      } as LiveMarketPosition['market'],
      source: {
        kind: 'vaultV2',
        vaultAddress: `0x${'5'.repeat(40)}`,
        vaultName: 'Stake DAO frxUSD v2',
        vaultSymbol: 'sdFRXUSDv2',
      },
    })

    expect(isVisibleDirectMarketPosition(position, { chainId: MAINNET_CHAIN_ID, minSupplyUsd: 1 })).toBe(false)
    expect(isVisibleVaultV2Position(position, { minSupplyUsd: 1 })).toBe(true)
  })

  it('renders Vault V2 holdings without market-only badges', () => {
    render(
      <VaultV2PositionList
        positions={[
          positionWithPrincipalUsd(35_000, {
            source: {
              kind: 'vaultV2',
              vaultAddress: `0x${'5'.repeat(40)}`,
              vaultName: 'Stake DAO frxUSD v2',
              vaultSymbol: 'sdFRXUSDv2',
            },
          }),
        ]}
        aprByMarketKey={{ [`0x${'1'.repeat(64)}`]: { apr: 0.2582 } }}
      />,
    )

    expect(screen.getByText('Vault holdings')).toBeInTheDocument()
    expect(screen.getByText('sdFRXUSDv2')).toBeInTheDocument()
    expect(screen.getByText('Stake DAO frxUSD v2')).toBeInTheDocument()
    expect(screen.queryByText('Market usage')).not.toBeInTheDocument()
    expect(screen.queryByText('Safety')).not.toBeInTheDocument()
  })
})
