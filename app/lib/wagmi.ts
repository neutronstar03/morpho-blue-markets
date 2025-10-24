import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain, fallback, http, webSocket } from 'viem'
import { arbitrum, base, katana, mainnet, polygon, unichain } from 'wagmi/chains'

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

export const config = getDefaultConfig({
  appName: 'Morpho Blue Markets',
  projectId: '0d13744a3dd855198cde1538ca87976d',
  chains: [arbitrum, base, katana, mainnet, polygon, unichain, hyperEvm],
  transports: {
    [mainnet.id]: fallback([
      http('https://ethereum-rpc.publicnode.com'),
      webSocket('wss://ethereum-rpc.publicnode.com'),
      http('https://1rpc.io/eth'),
      http('https://rpc.mevblocker.io'),
      http('https://rpc.flashbots.net/'),
      http('https://rpc.payload.de'),
      http('https://eth.meowrpc.com'),
      http('https://eth.drpc.org'),
      http('https://eth.merkle.io'),
      http('https://eth.blockrazor.xyz'),
      http('https://endpoints.omniatech.io/v1/eth/mainnet/public'),
      http('https://0xrpc.io/eth'),
      webSocket('wss://0xrpc.io/eth'),
    ], { rank: true, retryCount: 2 }),
    [base.id]: fallback([
      http('https://1rpc.io/base'),
      http('https://base.meowrpc.com'),
      http('https://base-rpc.publicnode.com'),
      webSocket('wss://base-rpc.publicnode.com'),
      http('https://base.drpc.org'),
      http('https://endpoints.omniatech.io/v1/base/mainnet/public'),
    ], { rank: true, retryCount: 2 }),
    [arbitrum.id]: fallback([
      http('https://arbitrum-one-rpc.publicnode.com'),
      webSocket('wss://arbitrum-one-rpc.publicnode.com'),
      http('https://arbitrum.drpc.org'),
      http('https://public-arb-mainnet.fastnode.io'),
    ], { rank: true, retryCount: 2 }),
    [katana.id]: http('https://rpc.katana.network'),
    [unichain.id]: fallback([
      http('https://unichain.drpc.org'),
      webSocket('wss://unichain.drpc.org'),
      http('https://0xrpc.io/uni'),
      webSocket('wss://0xrpc.io/uni'),
    ], { rank: true, retryCount: 2 }),
    [hyperEvm.id]: http('https://rpc.hyperliquid.xyz/evm'),
    [polygon.id]: fallback([
      http('https://1rpc.io/matic'),
      http('https://polygon-bor-rpc.publicnode.com'),
      webSocket('wss://polygon-bor-rpc.publicnode.com'),
      http('https://polygon.drpc.org'),
      http('https://endpoints.omniatech.io/v1/matic/mainnet/public'),
    ], { rank: true, retryCount: 2 }),
  },
})
