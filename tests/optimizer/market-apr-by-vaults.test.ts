import type { SupplyVaultData } from '../../app/lib/hooks/graphql/use-market-apr-by-vaults'
import { describe, expect, test } from 'bun:test'
import { buildEffectiveVaultAprMap, filterEligibleVaults, listPopularVaultAssetSymbols } from '../../app/lib/hooks/graphql/use-market-apr-by-vaults'

function vault(overrides: Partial<SupplyVaultData>): SupplyVaultData {
  return {
    address: '0x0000000000000000000000000000000000000001',
    name: 'Test Vault',
    symbol: 'TV',
    whitelisted: true,
    chain: { id: 1 },
    asset: {
      address: '0x0000000000000000000000000000000000000002',
      symbol: 'USDC',
      decimals: 6,
    },
    avgNetApy: 0.08,
    liquidityUsd: 100_000,
    version: 'v1',
    ...overrides,
  }
}

describe('market APR by vaults', () => {
  test('filters out blocked asset symbols', () => {
    const eligible = filterEligibleVaults([
      vault({ name: 'Good USDC', asset: { address: '0x1', symbol: 'USDC', decimals: 6 } }),
      vault({ name: 'Blocked apxUSD', asset: { address: '0x2', symbol: 'apxUSD', decimals: 18 } }),
      vault({ name: 'Blocked AUSD', asset: { address: '0x3', symbol: 'AUSD', decimals: 18 } }),
    ])

    expect(eligible.map(v => v.name)).toEqual(['Good USDC'])
  })

  test('applies mainnet floor when it beats local chain', () => {
    const eligible = filterEligibleVaults([
      vault({ name: 'Mainnet USDC', chain: { id: 1 }, avgNetApy: 0.09 }),
      vault({ name: 'Base USDC', chain: { id: 8453 }, avgNetApy: 0.08, address: '0x4' }),
    ], { blockedAssetSymbols: new Set() })

    const effective = buildEffectiveVaultAprMap(eligible, [1, 8453])
    expect(effective.get(1)?.vaultName).toBe('Mainnet USDC')
    expect(effective.get(8453)?.vaultName).toBe('Mainnet USDC')
    expect(effective.get(8453)?.source).toBe('mainnet-floor')
  })

  test('lists popular vault asset symbols', () => {
    const popular = listPopularVaultAssetSymbols([
      vault({ asset: { address: '0x1', symbol: 'USDC', decimals: 6 } }),
      vault({ asset: { address: '0x2', symbol: 'USDC', decimals: 6 } }),
      vault({ asset: { address: '0x3', symbol: 'FRXUSD', decimals: 18 } }),
    ])

    expect(popular).toEqual([
      { symbol: 'USDC', count: 2 },
      { symbol: 'FRXUSD', count: 1 },
    ])
  })
})
