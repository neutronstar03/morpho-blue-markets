import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import blacklistAssets from '../app/lib/blacklist.assets.json'
import { CHAIN_CAPABILITIES } from '../app/lib/chain-capabilities'
import { graphqlClient } from '../app/lib/graphql/client'
import { QUERY_COLLATERAL_CANDIDATES } from '../app/lib/graphql/queries/dataset-generation'
import { createCollateralPublicationPolicy } from '../app/lib/reviews/publication-policy'
import { parseCollateralCandidates } from './lib/collateral-candidates'
import { loadReviewDecisions } from './lib/review-decisions'

const OUTPUT_GOOD_PATH = 'public/whitelist.collaterals.json'
const OUTPUT_UNKNOWN_PATH = 'scripts/.cache/whitelist.collaterals.unknown.json'

// Matches the optimizer's `useMarketsByChain` pagination.
const PAGE_SIZE = 200

// Matches `app/pages/home/supply-apr-optimizer.tsx` candidate filters.
const MIN_CANDIDATE_NET_SUPPLY_APY = 0.01
const MAX_CANDIDATE_NET_SUPPLY_APY = 6
const MIN_CANDIDATE_BORROW_USD = 5

// Research discovery uses all supported chains; a price listing is not an approval.
const CHAINS = CHAIN_CAPABILITIES.map(chain => ({ chainId: chain.id, name: chain.name }))

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

async function fetchCollateralCandidates(chainId: number): Promise<string[]> {
  const addresses: string[] = []
  let skip = 0
  while (true) {
    const result = await graphqlClient.request<unknown>(QUERY_COLLATERAL_CANDIDATES, {
      where: {
        chainId_in: [chainId],
        netSupplyApy_gte: MIN_CANDIDATE_NET_SUPPLY_APY,
        netSupplyApy_lte: MAX_CANDIDATE_NET_SUPPLY_APY,
        borrowAssetsUsd_gte: MIN_CANDIDATE_BORROW_USD,
      },
      first: PAGE_SIZE,
      skip,
    })
    const page = parseCollateralCandidates(result, chainId)
    addresses.push(...page.addresses)
    if (page.rawCount < PAGE_SIZE)
      break
    skip += PAGE_SIZE
  }
  return addresses
}

async function main() {
  const dryRun = parseArgFlag('--dry-run')
  const recheckUnknown = parseArgFlag('--recheck-unknown')
  const resetGood = parseArgFlag('--reset-good')
  const resetUnknown = parseArgFlag('--reset-unknown')
  const resetAll = parseArgFlag('--reset-all')
  const unknownCooldownHours = parseArgNumber('--unknown-cooldown-hours', 100)
  const unknownCooldownMs = unknownCooldownHours * 60 * 60 * 1000

  const decisions = await loadReviewDecisions()
  const policy = createCollateralPublicationPolicy(decisions, blacklistAssets)
  const previousFile = Bun.file(OUTPUT_GOOD_PATH)
  const goodPrev: unknown = resetAll || resetGood || !(await previousFile.exists()) ? [] : await previousFile.json()
  const unknownPrev = (resetAll || resetUnknown)
    ? []
    : await readJsonFile<UnknownEntry[]>(OUTPUT_UNKNOWN_PATH, [])

  const goodByKey = new Map<string, GoodEntry>()
  for (const e of policy.applyWhitelist(goodPrev)) {
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

  let discovered = 0
  for (const chain of CHAINS) {
    console.log(`Fetching research candidates: ${chain.name} (${chain.chainId})...`)
    const addresses = await fetchCollateralCandidates(chain.chainId)
    for (const address of addresses) {
      const key = toKey(chain.chainId, address)
      if (policy.isExcluded(chain.chainId, address) || goodByKey.has(key)) {
        unknownByKey.delete(key)
        continue
      }
      const previous = unknownByKey.get(key)
      if (previous && (!recheckUnknown || nowMs() - previous.lastCheckedAtMs < unknownCooldownMs))
        continue
      unknownByKey.set(key, {
        chainId: chain.chainId,
        collateralAddress: address,
        firstSeenAtMs: previous?.firstSeenAtMs ?? nowMs(),
        lastCheckedAtMs: nowMs(),
      })
      discovered++
    }
  }
  for (const [key, entry] of unknownByKey) {
    if (goodByKey.has(key) || policy.isExcluded(entry.chainId, entry.collateralAddress))
      unknownByKey.delete(key)
  }
  for (const conflict of policy.conflicts)
    console.warn(`Existing exclusion preserved over positive review: ${conflict.chainId}:${conflict.collateralAddress}`)
  console.log(`Queued ${discovered} discovery updates for research; only explicit positive decisions add approvals.`)

  const goodOut = policy.applyWhitelist([...goodByKey.values()])
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
