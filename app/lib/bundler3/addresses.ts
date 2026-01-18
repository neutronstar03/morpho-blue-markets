export interface Bundler3Config {
  bundler3: `0x${string}`
  generalAdapter1: `0x${string}`
}

// Permit2 uses CREATE2 on all supported chains.
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const

// Sourced from repo `bundler3.md`. We keep only the chains this app supports.
export const BUNDLER3_CONFIG_BY_CHAIN_ID = {
  1: { // Ethereum
    bundler3: '0x6566194141eefa99Af43Bb5Aa71460Ca2Dc90245',
    generalAdapter1: '0x4A6c312ec70E8747a587EE860a0353cd42Be0aE0',
  },
  10: { // Optimism
    bundler3: '0xFBCd3C258feB131D8E038F2A3a670A7bE0507C05',
    generalAdapter1: '0x79481C87f24A3C4332442A2E9faaf675e5F141f0',
  },
  130: { // Unichain
    bundler3: '0x7DD85759182495AF7F6757DA75036d24A9B58bc3',
    generalAdapter1: '0xC11329d19C2275c9E759867e879ECFcEeD7e30A0',
  },
  137: { // Polygon
    bundler3: '0x2d9C3A9E67c966C711208cc78b34fB9E9f8db589',
    generalAdapter1: '0xB261B51938A9767406ef83bbFbaAFE16691b7047',
  },
  143: { // Monad
    bundler3: '0x82b684483e844422FD339df0b67b3B111F02c66E',
    generalAdapter1: '0x725AB8CAd931BCb80Fdbf10955a806765cCe00e5',
  },
  988: { // Stable
    bundler3: '0xA0bb114F927dF03d9a1a639b9c71F71B0FaFDf1B',
    generalAdapter1: '0x59b1F4376a81e39c466A0A218447E4D36f39A96b',
  },
  999: { // Hyperliquid
    bundler3: '0xa3F50477AfA601C771874260A3B34B40e244Fa0e',
    generalAdapter1: '0xD7F48aDE56613E8605863832B7B8A1985B934aE4',
  },
  8453: { // Base
    bundler3: '0x6BFd8137e702540E7A42B74178A4a49Ba43920C4',
    generalAdapter1: '0xb98c948CFA24072e58935BC004a8A7b376AE746A',
  },
  42161: { // Arbitrum
    bundler3: '0x1FA4431bC113D308beE1d46B0e98Cb805FB48C13',
    generalAdapter1: '0x9954aFB60BB5A222714c478ac86990F221788B88',
  },
  747474: { // Katana
    bundler3: '0xA8C5e23C9C0DF2b6fF716486c6bBEBB6661548C8',
    generalAdapter1: '0x916Aa175C36E845db45fF6DDB886AE437d403B61',
  },
} as const satisfies Record<number, Bundler3Config>

export function getBundler3Config(chainId?: number): Bundler3Config | undefined {
  if (!chainId)
    return undefined
  return (BUNDLER3_CONFIG_BY_CHAIN_ID as any)[chainId] as Bundler3Config | undefined
}
