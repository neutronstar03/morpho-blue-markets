import type { SupplyMarketData } from '../app/lib/graphql/queries/markets-by-chain'
import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import { graphqlClient } from '../app/lib/graphql/client'
import { MarketOrderBy, OrderDirection, QUERY_MARKETS_BY_CHAIN } from '../app/lib/graphql/queries/markets-by-chain'
import { filterBlacklistedMarkets } from '../app/lib/market-blacklist'
import { isOracleMisconfiguredWarning } from '../app/lib/morpho/morpho-warnings'

const OUTPUT_GOOD_PATH = 'public/whitelist.collaterals.json'
const OUTPUT_UNKNOWN_PATH = 'scripts/.cache/whitelist.collaterals.unknown.json'

// Matches the optimizer's `useMarketsByChain` pagination.
const PAGE_SIZE = 200

// Matches `app/pages/home/supply-apr-optimizer.tsx` candidate filters.
const MIN_CANDIDATE_NET_SUPPLY_APY = 0.01
const MAX_CANDIDATE_NET_SUPPLY_APY = 6
const MIN_CANDIDATE_BORROW_USD = 5

const CHAINS = [
  { chainId: 1, name: 'Ethereum', llamaSlug: 'ethereum' },
  { chainId: 8453, name: 'Base', llamaSlug: 'base' },
  { chainId: 42161, name: 'Arbitrum', llamaSlug: 'arbitrum' },
  { chainId: 137, name: 'Polygon', llamaSlug: 'polygon' },
  { chainId: 130, name: 'Unichain', llamaSlug: 'unichain' },
  { chainId: 999, name: 'Hyperliquid', llamaSlug: 'hyperliquid' },
  { chainId: 747474, name: 'Katana', llamaSlug: 'katana' },
  { chainId: 10, name: 'Optimism', llamaSlug: 'optimism' },
  { chainId: 143, name: 'Monad', llamaSlug: 'monad' },
  { chainId: 988, name: 'Stable', llamaSlug: 'stable' },
] as const

interface GoodEntry {
  chainId: number
  collateralAddress: string
}

interface UnknownEntry extends GoodEntry {
  firstSeenAtMs: number
  lastCheckedAtMs: number
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase()
}

function nowMs() {
  return Date.now()
}

function jittered(ms: number) {
  const spread = Math.max(50, Math.floor(ms * 0.2))
  return ms + Math.floor(Math.random() * spread)
}

function parseArgFlag(name: string) {
  return Bun.argv.includes(name)
}

function parseArgNumber(name: string, fallback: number) {
  const idx = Bun.argv.findIndex(a => a === name)
  if (idx === -1)
    return fallback
  const raw = Bun.argv[idx + 1]
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists()))
      return fallback
    const text = await file.text()
    if (!text.trim())
      return fallback
    return JSON.parse(text) as T
  }
  catch {
    return fallback
  }
}

function toKey(chainId: number, collateralAddress: string) {
  return `${chainId}:${normalizeAddress(collateralAddress)}`
}

async function fetchOptimizerMarketsByChain(chainId: number): Promise<SupplyMarketData[]> {
  const where: any = {
    chainId_in: [chainId],
    netSupplyApy_gte: MIN_CANDIDATE_NET_SUPPLY_APY,
    netSupplyApy_lte: MAX_CANDIDATE_NET_SUPPLY_APY,
    borrowAssetsUsd_gte: MIN_CANDIDATE_BORROW_USD,
  }

  const markets: SupplyMarketData[] = []
  let skip = 0
  while (true) {
    const result = await graphqlClient.request<any>(QUERY_MARKETS_BY_CHAIN, {
      where,
      orderBy: MarketOrderBy.NetSupplyApy,
      orderDirection: OrderDirection.Desc,
      first: PAGE_SIZE,
      skip,
    })

    const items = (result?.markets?.items ?? []) as SupplyMarketData[]
    markets.push(...items)
    if (items.length < PAGE_SIZE)
      break
    skip += PAGE_SIZE
  }

  return filterBlacklistedMarkets(markets, market => ({
    uniqueKey: market.uniqueKey,
    loanAssetAddress: market.loanAsset?.address,
    collateralAssetAddress: market.collateralAsset?.address,
    loanAssetSymbol: market.loanAsset?.symbol,
    collateralAssetSymbol: market.collateralAsset?.symbol,
    chainId,
  })).filter(m => !isOracleMisconfiguredWarning(m.warnings))
}

interface LlamaPriceResponse {
  coins: Record<string, {
    decimals?: number
    symbol?: string
    price?: number
    timestamp?: number
    confidence?: number
  }>
}

async function fetchLlamaPricesWithBackoff(keys: string[]): Promise<LlamaPriceResponse> {
  const maxRetries = 12
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const url = `https://coins.llama.fi/prices/current/${keys.join(',')}`
    try {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
        },
      })

      if (res.ok)
        return (await res.json()) as LlamaPriceResponse

      if (res.status === 429) {
        const retryAfterRaw = res.headers.get('retry-after')
        const retryAfterMs = retryAfterRaw ? Number(retryAfterRaw) * 1000 : Number.NaN
        const base = Number.isFinite(retryAfterMs) ? retryAfterMs : 1_000 * (2 ** Math.min(10, attempt))
        const waitMs = Math.min(5 * 60_000, jittered(Math.max(1_000, base)))
        await Bun.sleep(waitMs)
        continue
      }

      if (res.status >= 500 && res.status <= 599) {
        const waitMs = Math.min(3 * 60_000, jittered(1_000 * (2 ** Math.min(10, attempt))))
        await Bun.sleep(waitMs)
        continue
      }

      throw new Error(`DefiLlama HTTP ${res.status}`)
    }
    catch (e) {
      if (attempt === maxRetries)
        throw e
      const waitMs = Math.min(3 * 60_000, jittered(500 * (2 ** Math.min(10, attempt))))
      await Bun.sleep(waitMs)
    }
  }

  return { coins: {} }
}

async function main() {
  const dryRun = parseArgFlag('--dry-run')
  const recheckUnknown = parseArgFlag('--recheck-unknown')
  const resetGood = parseArgFlag('--reset-good')
  const resetUnknown = parseArgFlag('--reset-unknown')
  const resetAll = parseArgFlag('--reset-all')
  const unknownCooldownHours = parseArgNumber('--unknown-cooldown-hours', 100)
  const unknownCooldownMs = unknownCooldownHours * 60 * 60 * 1000

  const goodPrev = (resetAll || resetGood)
    ? []
    : await readJsonFile<GoodEntry[]>(OUTPUT_GOOD_PATH, [])
  const unknownPrev = (resetAll || resetUnknown)
    ? []
    : await readJsonFile<UnknownEntry[]>(OUTPUT_UNKNOWN_PATH, [])

  const goodByKey = new Map<string, GoodEntry>()
  for (const e of goodPrev) {
    if (!e || !e.chainId || !e.collateralAddress)
      continue
    goodByKey.set(toKey(e.chainId, e.collateralAddress), {
      chainId: Number(e.chainId),
      collateralAddress: normalizeAddress(e.collateralAddress),
    })
  }

  const unknownByKey = new Map<string, UnknownEntry>()
  for (const e of unknownPrev) {
    if (!e || !e.chainId || !e.collateralAddress)
      continue
    const k = toKey(e.chainId, e.collateralAddress)
    unknownByKey.set(k, {
      chainId: Number(e.chainId),
      collateralAddress: normalizeAddress(e.collateralAddress),
      firstSeenAtMs: Number.isFinite(e.firstSeenAtMs) ? e.firstSeenAtMs : nowMs(),
      lastCheckedAtMs: Number.isFinite(e.lastCheckedAtMs) ? e.lastCheckedAtMs : 0,
    })
  }

  console.log(`Loaded: ${goodByKey.size} good collaterals, ${unknownByKey.size} unknown collaterals.`)

  const candidates = new Map<string, { chainId: number, collateralAddress: string, llamaSlug: string }>()

  for (const chain of CHAINS) {
    console.log(`Fetching markets: ${chain.name} (${chain.chainId})...`)
    const markets = await fetchOptimizerMarketsByChain(chain.chainId)
    console.log(`  got ${markets.length} candidate markets after filters`)

    for (const m of markets) {
      const addr = normalizeAddress(m.collateralAsset?.address ?? '')
      if (!addr)
        continue
      const key = toKey(chain.chainId, addr)
      if (goodByKey.has(key))
        continue
      if (!recheckUnknown && unknownByKey.has(key))
        continue
      candidates.set(key, { chainId: chain.chainId, collateralAddress: addr, llamaSlug: chain.llamaSlug })
    }
  }

  // Optional: add unknown entries back for periodic recheck.
  if (recheckUnknown) {
    const now = nowMs()
    for (const [key, entry] of unknownByKey.entries()) {
      const shouldRecheck = (now - entry.lastCheckedAtMs) >= unknownCooldownMs
      if (!shouldRecheck)
        continue
      const chain = CHAINS.find(c => c.chainId === entry.chainId)
      if (!chain)
        continue
      candidates.set(key, { chainId: entry.chainId, collateralAddress: entry.collateralAddress, llamaSlug: chain.llamaSlug })
    }
  }

  console.log(`To validate with DefiLlama: ${candidates.size}`)
  if (candidates.size === 0)
    return

  const batchSize = 40
  const keys = [...candidates.values()].map(c => ({
    key: `${c.llamaSlug}:${c.collateralAddress}`,
    chainId: c.chainId,
    collateralAddress: c.collateralAddress,
  }))

  let okCount = 0
  let unknownCount = 0

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    const llamaKeys = batch.map(b => b.key)
    const res = await fetchLlamaPricesWithBackoff(llamaKeys)
    const coins = res?.coins ?? {}

    for (const item of batch) {
      const found = coins[item.key]
      const k = toKey(item.chainId, item.collateralAddress)
      if (found && Number.isFinite(found.price)) {
        goodByKey.set(k, { chainId: item.chainId, collateralAddress: item.collateralAddress })
        unknownByKey.delete(k)
        okCount++
      }
      else {
        const prev = unknownByKey.get(k)
        const entry: UnknownEntry = {
          chainId: item.chainId,
          collateralAddress: item.collateralAddress,
          firstSeenAtMs: prev?.firstSeenAtMs ?? nowMs(),
          lastCheckedAtMs: nowMs(),
        }
        unknownByKey.set(k, entry)
        unknownCount++
      }
    }

    console.log(`Validated ${Math.min(i + batch.length, keys.length)}/${keys.length} (ok=${okCount}, unknown=${unknownCount})`)
  }

  const goodOut = [...goodByKey.values()]
    .sort((a, b) => a.chainId - b.chainId || a.collateralAddress.localeCompare(b.collateralAddress))
  const unknownOut = [...unknownByKey.values()]
    .sort((a, b) => a.chainId - b.chainId || a.collateralAddress.localeCompare(b.collateralAddress))

  if (dryRun) {
    console.log('Dry run: skipping writes.')
    console.log(`Would write: ${goodOut.length} good, ${unknownOut.length} unknown.`)
    return
  }

  await mkdir('scripts/.cache', { recursive: true })

  await Bun.write(OUTPUT_GOOD_PATH, `${JSON.stringify(goodOut, null, 2)}\n`)
  await Bun.write(OUTPUT_UNKNOWN_PATH, `${JSON.stringify(unknownOut, null, 2)}\n`)
  console.log(`Wrote ${goodOut.length} good collaterals to ${OUTPUT_GOOD_PATH}.`)
  console.log(`Wrote ${unknownOut.length} unknown collaterals to ${OUTPUT_UNKNOWN_PATH}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
