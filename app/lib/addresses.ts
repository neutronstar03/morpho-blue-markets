import type { SupportedChain } from './chain-capabilities'
import { CHAIN_CAPABILITIES } from './chain-capabilities'

// Chain identity, Morpho addresses, and provider capabilities live in the
// dependency-free registry. This module derives the browser-facing lookup maps
// from it and keeps the historical export names.
export type { SupportedChain, SupportedChainId } from './chain-capabilities'

export const morphoAddressOnChain = CHAIN_CAPABILITIES.reduce(
  (acc, chain) => {
    acc[chain.name] = chain.morphoAddress
    return acc
  },
  {} as Record<SupportedChain, `0x${string}`>,
)

export type UnknownChainName = `Chain ${number}`

export const supportedChainMap: Map<number, SupportedChain> = new Map(
  CHAIN_CAPABILITIES.map(chain => [chain.id, chain.name]),
)

// Reverse map: chainName -> chainId
export const supportedChainIdMap: Map<SupportedChain, number> = new Map(
  CHAIN_CAPABILITIES.map(chain => [chain.name, chain.id]),
)

export type SupportedChainName = SupportedChain | UnknownChainName
export function getSupportedChainName(
  chainId?: number,
  defaultChain: SupportedChain = 'Ethereum',
): SupportedChainName {
  if (chainId == null)
    return defaultChain
  const chainName = supportedChainMap.get(chainId)
  return chainName ?? `Chain ${chainId}`
}
