import { describe, expect, test } from 'bun:test'
import {
  getSupportedChainName,
  morphoAddressOnChain,
  supportedChainIdMap,
  supportedChainMap,
} from '../../app/lib/addresses'
import { getBundler3Config } from '../../app/lib/bundler3/addresses'
import {
  CHAIN_CAPABILITIES,
  chainProviderSlugMap,
} from '../../app/lib/chain-capabilities'
import { DEFILLAMA_CHAIN_SLUGS } from '../../app/lib/defillama'
import { isKyberSwapSupportedChain } from '../../app/lib/kyberswap'
import { config, configuredWagmiChainIds } from '../../app/lib/wagmi'

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/

describe('chain capability registry', () => {
  test('chain ids and names are unique', () => {
    const ids = CHAIN_CAPABILITIES.map(chain => chain.id)
    const names = CHAIN_CAPABILITIES.map(chain => chain.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  test('supported-chain maps are projections of the registry', () => {
    expect(supportedChainMap.size).toBe(CHAIN_CAPABILITIES.length)
    expect(supportedChainIdMap.size).toBe(CHAIN_CAPABILITIES.length)
    for (const chain of CHAIN_CAPABILITIES) {
      expect(supportedChainMap.get(chain.id)).toBe(chain.name)
      expect(supportedChainIdMap.get(chain.name)).toBe(chain.id)
    }
  })

  test('morpho addresses project from the registry and are well formed', () => {
    for (const chain of CHAIN_CAPABILITIES) {
      expect(morphoAddressOnChain[chain.name]).toBe(chain.morphoAddress)
      expect(chain.morphoAddress).toMatch(HEX_ADDRESS)
    }
    expect(Object.keys(morphoAddressOnChain).sort()).toEqual(
      CHAIN_CAPABILITIES.map(chain => chain.name).sort(),
    )
  })

  // Compares the wagmi wallet adapter against the registry instead of another
  // registry-derived map, so a wallet-registration gap fails here.
  test('every registry chain is registered in the wagmi wallet config, and vice versa', () => {
    const registryIds = new Set<number>(CHAIN_CAPABILITIES.map(chain => chain.id))
    for (const chainId of registryIds)
      expect(configuredWagmiChainIds.has(chainId)).toBe(true)
    for (const chainId of configuredWagmiChainIds)
      expect(registryIds.has(chainId)).toBe(true)
    expect(configuredWagmiChainIds.size).toBe(registryIds.size)
  })

  test('each chain can build an RPC client and resolve its Bundler deployment', () => {
    for (const chain of CHAIN_CAPABILITIES) {
      expect(config.getClient({ chainId: chain.id }).chain.id).toBe(chain.id)
      const bundler = getBundler3Config(chain.id)
      expect(bundler?.bundler3).toMatch(HEX_ADDRESS)
      expect(bundler?.generalAdapter1).toMatch(HEX_ADDRESS)
    }
  })

  test('DefiLlama slug record matches the registry', () => {
    expect(Object.keys(DEFILLAMA_CHAIN_SLUGS).sort()).toEqual(
      CHAIN_CAPABILITIES.map(chain => chain.name).sort(),
    )
    for (const chain of CHAIN_CAPABILITIES)
      expect(DEFILLAMA_CHAIN_SLUGS[chain.name]).toBe(chain.providers.defillama)
  })

  test('GeckoTerminal slug map projects from the registry, including Monad and Stable', () => {
    const gecko = chainProviderSlugMap('geckoterminal')
    const expected = CHAIN_CAPABILITIES.filter(chain => chain.providers.geckoterminal !== null)
    expect(gecko.size).toBe(expected.length)
    for (const chain of expected)
      expect(gecko.get(chain.id)).toBe(chain.providers.geckoterminal)
    expect(gecko.get(143)).toBe('monad')
    expect(gecko.get(988)).toBe('stable')
  })

  test('KyberSwap support agrees with the registry capability, nulls stay unsupported', () => {
    for (const chain of CHAIN_CAPABILITIES) {
      expect(isKyberSwapSupportedChain(chain.id)).toBe(chain.providers.kyberswap !== null)
    }
    for (const chainId of [747474, 988, 480])
      expect(isKyberSwapSupportedChain(chainId)).toBe(false)
  })

  test('Robinhood stays covered with verified provider slugs', () => {
    const robinhood = CHAIN_CAPABILITIES.find(chain => chain.id === 4663)
    expect(robinhood?.name).toBe('Robinhood Chain')
    expect(robinhood?.morphoAddress).toBe('0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010')
    expect(robinhood?.providers.geckoterminal).toBe('robinhood')
    expect(robinhood?.providers.coingecko).toBe('robinhood')
    expect(robinhood?.providers.defillama).toBe('robinhood')
    expect(robinhood?.providers.kyberswap).toBe('robinhood')
    expect(robinhood?.providers.defined).toBeNull()
  })

  test('chain-name resolution keeps its historical anchors', () => {
    expect(getSupportedChainName(1)).toBe('Ethereum')
    expect(getSupportedChainName(143)).toBe('Monad')
    expect(getSupportedChainName(988)).toBe('Stable')
    expect(getSupportedChainName(4663)).toBe('Robinhood Chain')
    expect(getSupportedChainName(123_456)).toBe('Chain 123456')
  })
})
