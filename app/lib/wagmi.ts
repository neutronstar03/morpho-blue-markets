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
      http('https://rpc.builder0x69.io/'),
      http('https://rpc.mevblocker.io'),
      http('https://rpc.flashbots.net/'),
      http('https://rpc.payload.de'),
      http('https://api.zmok.io/mainnet/oaen6dy8ff6hju9k'),
      http('https://eth.meowrpc.com'),
      http('https://eth.drpc.org'),
      http('https://eth.merkle.io'),
      http('https://rpc.lokibuilder.xyz/wallet'),
      http('https://api.stateless.solutions/ethereum/v1/demo'),
      http('https://rpc.polysplit.cloud/v1/chain/1'),
      http('https://rpc.nodifi.ai/api/rpc/free'),
      http('https://rpc.public.curie.radiumblock.co/http/ethereum'),
      http('https://rpc.public.curie.radiumblock.co/ws/ethereum'),
      webSocket('wss://ethereum.callstaticrpc.com'),
      http('https://eth.blockrazor.xyz'),
      http('https://endpoints.omniatech.io/v1/eth/mainnet/public'),
      http('https://0xrpc.io/eth'),
      webSocket('wss://0xrpc.io/eth'),
      http('https://ethereum-json-rpc.stakely.io'),
    ], { rank: true, retryCount: 2 }),
    [base.id]: fallback([
      http('https://1rpc.io/base'),
      http('https://base.meowrpc.com'),
      http('https://base-rpc.publicnode.com'),
      webSocket('wss://base-rpc.publicnode.com'),
      http('https://base.drpc.org'),
      webSocket('wss://base.callstaticrpc.com'),
      http('https://endpoints.omniatech.io/v1/base/mainnet/public'),
    ], { rank: true, retryCount: 2 }),
    [arbitrum.id]: fallback([
      http('https://1rpc.io/arb'),
      http('https://arbitrum-one-rpc.publicnode.com'),
      webSocket('wss://arbitrum-one-rpc.publicnode.com'),
      http('https://arbitrum.meowrpc.com'),
      http('https://arbitrum.drpc.org'),
      http('https://api.stateless.solutions/arbitrum-one/v1/demo'),
      webSocket('wss://arbitrum.callstaticrpc.com'),
      http('https://endpoints.omniatech.io/v1/arbitrum/one/public'),
      http('https://public-arb-mainnet.fastnode.io'),
    ], { rank: true, retryCount: 2 }),
    [katana.id]: http('https://rpc.katana.network'),
    [unichain.id]: fallback([
      http('https://rpc.unichain.io'),
      http('https://unichain-rpc.publicnode.com'),
      webSocket('wss://unichain-rpc.publicnode.com'),
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
      http('https://polygon.meowrpc.com'),
      http('https://endpoints.omniatech.io/v1/matic/mainnet/public'),
    ], { rank: true, retryCount: 2 }),
  },
})
