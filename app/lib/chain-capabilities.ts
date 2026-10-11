// Dependency-free plain-data registry of the chains MBM supports.
//
// This module is intentionally free of React, viem, wagmi, and every runtime
// provider client: the browser app, the Cloudflare Pages Functions, and the
// Node/Bun artifact generators all import the same source of truth from here.
//
// Wallet chain objects (app/lib/wagmi.ts), React icon components
// (app/lib/chain-icons.tsx), and Bundler3 deployment addresses
// (app/lib/bundler3/addresses.ts) stay in their own adapters and are only
// compared against this registry by tests.
//
// Provider capability rules:
// - A null slug is a deliberate "provider does not serve this chain" state.
//   Never invent a slug to fill a gap.
// - geckoterminal/defined/coingecko/defillama/kyberswap slugs below are the
//   values verified against each provider on 2026-10-11 (see per-entry notes).
//
// SupportedChain and SupportedChainId are derived from the entries, so adding a
// chain here updates every downstream list, map, and type at once.

export const CHAIN_CAPABILITIES = [
  {
    id: 1,
    name: 'Ethereum',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    providers: { geckoterminal: 'eth', defined: 'eth', coingecko: 'ethereum', defillama: 'ethereum', kyberswap: 'ethereum' },
  },
  {
    id: 8453,
    name: 'Base',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    providers: { geckoterminal: 'base', defined: 'base', coingecko: 'base', defillama: 'base', kyberswap: 'base' },
  },
  {
    id: 42161,
    name: 'Arbitrum',
    morphoAddress: '0x6c247b1F6182318877311737BaC0844bAa518F5e',
    providers: { geckoterminal: 'arbitrum', defined: 'arbitrum', coingecko: 'arbitrum-one', defillama: 'arbitrum', kyberswap: 'arbitrum' },
  },
  {
    id: 137,
    name: 'Polygon',
    morphoAddress: '0x1bF0c2541F820E775182832f06c0B7Fc27A25f67',
    providers: { geckoterminal: 'polygon', defined: 'polygon', coingecko: 'polygon-pos', defillama: 'polygon', kyberswap: 'polygon' },
  },
  {
    id: 130,
    name: 'Unichain',
    morphoAddress: '0x8f5ae9cddb9f68de460c77730b018ae7e04a140a',
    providers: { geckoterminal: 'unichain', defined: 'unichain', coingecko: 'unichain', defillama: 'unichain', kyberswap: 'unichain' },
  },
  {
    id: 999,
    name: 'Hyperliquid',
    morphoAddress: '0x68e37dE8d93d3496ae143F2E900490f6280C57cD',
    providers: { geckoterminal: 'hyperevm', defined: 'hyperevm', coingecko: 'hyperevm', defillama: 'hyperliquid', kyberswap: 'hyperevm' },
  },
  {
    id: 747474,
    name: 'Katana',
    morphoAddress: '0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc',
    // KyberSwap aggregator returns 404 for /katana routes (2026-10-11).
    providers: { geckoterminal: 'katana', defined: 'katana', coingecko: 'katana', defillama: 'katana', kyberswap: null },
  },
  {
    id: 10,
    name: 'Optimism',
    morphoAddress: '0xce95AfbB8EA029495c66020883F87aaE8864AF92',
    providers: { geckoterminal: 'optimism', defined: 'op', coingecko: 'optimistic-ethereum', defillama: 'optimism', kyberswap: 'optimism' },
  },
  {
    id: 143,
    name: 'Monad',
    morphoAddress: '0xD5D960E8C380B724a48AC59E2DfF1b2CB4a1eAee',
    // GeckoTerminal 'monad' verified against api.geckoterminal.com/api/v2/networks (2026-10-11).
    providers: { geckoterminal: 'monad', defined: 'monad', coingecko: 'monad', defillama: 'monad', kyberswap: 'monad' },
  },
  {
    id: 988,
    name: 'Stable',
    morphoAddress: '0xa40103088A899514E3fe474cD3cc5bf811b1102e',
    // GeckoTerminal 'stable' verified against api.geckoterminal.com/api/v2/networks (2026-10-11).
    // KyberSwap aggregator returns 404 for /stable routes (2026-10-11).
    providers: { geckoterminal: 'stable', defined: 'stable', coingecko: 'stable', defillama: 'stable', kyberswap: null },
  },
  {
    id: 480,
    name: 'World Chain',
    morphoAddress: '0xE741BC7c34758b4caE05062794E8Ae24978AF432',
    // DefiLlama accepts both '480' and 'world-chain'; '480' is the long-standing value.
    // KyberSwap aggregator returns 404 for /world-chain routes (2026-10-11).
    providers: { geckoterminal: 'world-chain', defined: 'worldchain', coingecko: 'world-chain', defillama: '480', kyberswap: null },
  },
  {
    id: 4663,
    name: 'Robinhood Chain',
    morphoAddress: '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010',
    // defined.fi robinhood slug was not verified against a primary source, so the
    // capability stays null instead of guessing (the risk panel simply omits the link).
    providers: { geckoterminal: 'robinhood', defined: null, coingecko: 'robinhood', defillama: 'robinhood', kyberswap: 'robinhood' },
  },
] as const satisfies readonly {
  id: number
  name: string
  morphoAddress: `0x${string}`
  providers: {
    geckoterminal: string | null
    defined: string | null
    coingecko: string | null
    defillama: string | null
    kyberswap: string | null
  }
}[]

export type ChainCapability = (typeof CHAIN_CAPABILITIES)[number]
export type SupportedChain = ChainCapability['name']
export type SupportedChainId = ChainCapability['id']
export type ChainProviderCapabilities = ChainCapability['providers']
export type ChainProviderKey = keyof ChainProviderCapabilities

// Derives a chainId -> slug map for one provider, skipping chains the provider
// does not serve. Consumers that need a by-name view build it from
// CHAIN_CAPABILITIES directly.
export function chainProviderSlugMap(provider: ChainProviderKey): Map<number, string> {
  const map = new Map<number, string>()
  for (const chain of CHAIN_CAPABILITIES) {
    const slug = chain.providers[provider]
    if (slug !== null)
      map.set(chain.id, slug)
  }
  return map
}
