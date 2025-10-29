export type SupportedChain = 'Ethereum' | 'Base' | 'Arbitrum' | 'Polygon' | 'Hyperliquid' | 'Unichain' | 'Katana'

export const morphoAddressOnChain = {
  Ethereum: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  Base: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  Arbitrum: '0x6c247b1F6182318877311737BaC0844bAa518F5e',
  Polygon: '0x1bF0c2541F820E775182832f06c0B7Fc27A25f67',
  Hyperliquid: '0x68e37dE8d93d3496ae143F2E900490f6280C57cD',
  Unichain: '0x8f5ae9cddb9f68de460c77730b018ae7e04a140a',
  Katana: '0xD50F2DffFd62f94Ee4AEd9ca05C61d0753268aBc',
} as const satisfies Record<SupportedChain, `0x${string}`>

export const supportedChains = Object.keys(morphoAddressOnChain) as SupportedChain[]

export type SupportedChainId = 1 | 8453 | 42161 | 137 | 130 | 999 | 747474
export type UnknownChainName = `Chain ${number}`

export const supportedChainMap = new Map<number, SupportedChain>([
  [1, 'Ethereum'],
  [8453, 'Base'],
  [42161, 'Arbitrum'],
  [137, 'Polygon'],
  [130, 'Unichain'],
  [999, 'Hyperliquid'],
  [747474, 'Katana'],
])

// Reverse map: chainName -> chainId
export const supportedChainIdMap = new Map<SupportedChain, number>(
  Array.from(supportedChainMap.entries()).map(([id, name]) => [name, id]),
)

export function getSupportedChainName(chainId: number): SupportedChain | UnknownChainName {
  if (chainId == null)
    throw new Error('Missing chain id')
  const chainName = supportedChainMap.get(chainId)
  return chainName ?? `Chain ${chainId}`
}
