import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { arbitrum, base, katana, mainnet, polygon, unichain } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

const hyperEvm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: {
    name: 'HYPE',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  blockExplorers: {
    default: {
      name: 'HyperEVMScan',
      url: 'https://hyperevmscan.io/',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 13051,
    },
  },
})

export const config = createConfig({
  chains: [arbitrum, base, katana, mainnet, polygon, unichain, hyperEvm],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http('https://eth.llamarpc.com'),
    [base.id]: http('https://1rpc.io/base'),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc'),
    [katana.id]: http('https://rpc.katana.network'),
    [unichain.id]: http('https://rpc.unichain.io'),
    [hyperEvm.id]: http('https://rpc.hyperliquid.xyz/evm'),
    [polygon.id]: http('https://1rpc.io/matic'),
  },
})
