import process from 'node:process'
import { fallback, http } from 'viem'

/**
 * Self-contained RPC list (no dependency on app/lib/wagmi.ts).
 * You can paste/replace URLs here freely.
 */
export const MAINNET_RPC_URLS = [
  // Public endpoints (replace with your private RPCs if desired)
  'https://ethereum-rpc.publicnode.com',
  'https://1rpc.io/eth',
  'https://rpc.mevblocker.io',
  'https://rpc.flashbots.net/',
] as const

export function makeMainnetTransport() {
  const envUrl = process.env.MAINNET_RPC_URL || process.env.RPC_URL
  const urls = envUrl ? [envUrl, ...MAINNET_RPC_URLS] : [...MAINNET_RPC_URLS]
  return fallback(
    urls.map(url => http(url)),
    { rank: false, retryCount: 2 },
  )
}
