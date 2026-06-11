export interface EulerChainConfig {
  chainId: number
  chainName: string
  defillamaSlug: string
  goldskyEndpoint: string
  metadataEndpoint: string
  irmLensAddress: `0x${string}`
  rpcUrls: string[]
}

export const EULER_MAINNET: EulerChainConfig = {
  chainId: 1,
  chainName: 'Ethereum',
  defillamaSlug: 'ethereum',
  goldskyEndpoint: 'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn',
  metadataEndpoint: 'https://app.euler.finance/api/public/metadata?chainId=1',
  irmLensAddress: '0x061b6b0bA1B552006556C278FC8798D1e20F807a',
  rpcUrls: [
    'https://ethereum-rpc.publicnode.com',
    'https://1rpc.io/eth',
    'https://rpc.flashbots.net/',
  ],
}

export const EULER_CHAINS = [EULER_MAINNET] as const
