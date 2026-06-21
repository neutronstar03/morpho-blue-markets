import type { LiveMarketPosition } from '../../app/lib/morpho/live-position'
import { describe, expect, it } from 'vitest'
import { fetchUserPositions } from '../../app/lib/hooks/graphql/use-user-positions'
import { fetchUserVaultV2AdapterPositions } from '../../app/lib/hooks/graphql/use-vault-v2-adapter-positions'
import { isVisiblePositionRow } from '../../app/pages/home/position/position-utils'

const PRIVATE_POSITION_WALLET = process.env.MBM_PRIVATE_POSITION_TEST_WALLET
const MAINNET_CHAIN_ID = 1
const MSY_USDC_MARKET_ID = '0x23a7d0ff682b323363fb8ba58327ed87001f6306e09b7fd7413bbe4698e749c8'

function positionWithPrincipalUsd(principalUsd: number): LiveMarketPosition {
  return {
    market: {
      uniqueKey: `0x${'1'.repeat(64)}`,
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

  it.runIf(PRIVATE_POSITION_WALLET)('keeps Vault V2 adapter rows additive for the same private wallet', async () => {
    const positions = await fetchUserVaultV2AdapterPositions(PRIVATE_POSITION_WALLET!, MAINNET_CHAIN_ID)

    expect(positions.some(position => position.source?.kind === 'vaultV2Adapter')).toBe(true)
    expect(positions.some(position => position.source?.vaultSymbol === 'sdFRXUSDv2')).toBe(true)
  }, 30_000)

  it('hides supply-only dust below one dollar', () => {
    expect(isVisiblePositionRow(positionWithPrincipalUsd(0.5), { minSupplyUsd: 1 })).toBe(false)
    expect(isVisiblePositionRow(positionWithPrincipalUsd(1), { minSupplyUsd: 1 })).toBe(true)
  })
})
