import { describe, expect, test } from 'bun:test'
import { supportedChainMap } from '../../app/lib/addresses'
import { BLOCKED_VAULT_ASSET_SYMBOLS, fetchMarketAprByVaults } from '../../app/lib/hooks/graphql/use-market-apr-by-vaults'

describe('market APR by vaults (live)', () => {
  test('prints popular eligible vault assets and excludes blocked symbols', async () => {
    const chainIds = [...supportedChainMap.keys()]
    const result = await fetchMarketAprByVaults(chainIds)

    console.warn('Popular eligible vault assets:', result.popularAssets.map(x => `${x.symbol} (${x.count})`).join(', '))
    console.warn('Effective vault by chain:')
    for (const [chainId, entry] of result.effectiveByChainId.entries()) {
      console.warn(`- ${chainId}: ${entry.source} -> ${entry.vaultName} @ ${entry.effectiveAprInput}%`)
    }

    expect(result.eligibleVaults.length).toBeGreaterThan(0)
    for (const symbol of BLOCKED_VAULT_ASSET_SYMBOLS)
      expect(result.popularAssets.some(x => x.symbol === symbol)).toBe(false)
  }, 30000)
})
