import type { SupportedChain } from './addresses'
import { CHAIN_CAPABILITIES } from './chain-capabilities'

// Derived from the chain capability registry; every supported chain has a
// DefiLlama slug today, so the record stays total.
export const DEFILLAMA_CHAIN_SLUGS: Record<SupportedChain, string> = Object.fromEntries(
  CHAIN_CAPABILITIES.map(chain => [chain.name, chain.providers.defillama]),
) as Record<SupportedChain, string>

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
