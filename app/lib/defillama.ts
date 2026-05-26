import type { SupportedChain } from './addresses'

export const DEFILLAMA_CHAIN_SLUGS: Record<SupportedChain, string> = {
  'Ethereum': 'ethereum',
  'Base': 'base',
  'Arbitrum': 'arbitrum',
  'Polygon': 'polygon',
  'Hyperliquid': 'hyperliquid',
  'Unichain': 'unichain',
  'Katana': 'katana',
  'Optimism': 'optimism',
  'Monad': 'monad',
  'Stable': 'stable',
  'World Chain': '480',
}

export interface LlamaPriceEntry {
  decimals?: number
  symbol?: string
  price?: number
  timestamp?: number
  confidence?: number
}

export interface LlamaPriceResponse {
  coins: Record<string, LlamaPriceEntry>
}

export async function fetchLlamaPrices(keys: string[]): Promise<LlamaPriceResponse> {
  const url = `https://coins.llama.fi/prices/current/${keys.join(',')}`
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`DefiLlama HTTP ${res.status}`)
  }
  return res.json() as Promise<LlamaPriceResponse>
}
