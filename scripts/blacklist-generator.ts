import process from 'node:process'

const MORPHO_GRAPHQL_URL = 'https://blue-api.morpho.org/graphql'

const OUTPUT_PATH = 'public/blacklist.markets.json'
const UNHEALTHY_OUTPUT_PATH = 'public/unhealthy.markets.json'
const MANUAL_INPUT_PATH = 'public/blacklist.markets.manual.json'
const PAGE_SIZE = 200
const UNHEALTHY_BORROW_USD_THRESHOLD = 500
const MIN_UNHEALTHY_POSITION_BORROW_USD = 1

interface MarketCandidate {
  chainId: number
  uniqueKey: string
  slug: string
  warnings: Array<{
    type: string
    level: 'YELLOW' | 'RED'
  }>
}

interface MarketsResponse {
  markets: {
    items: Array<{
      uniqueKey: string
      morphoBlue: { chain: { id: number } }
      collateralAsset: { symbol: string | null, address: string } | null
      loanAsset: { symbol: string | null, address: string } | null
      warnings: Array<{
        type: string
        level: 'YELLOW' | 'RED'
      }>
    }>
  }
}

interface UnhealthyMarketPositionResponse {
  marketPositions: {
    items: Array<{
      healthFactor: number | null
      market: {
        marketId: string
        morphoBlue: { chain: { id: number } }
        collateralAsset: { symbol: string | null, address: string } | null
        loanAsset: { symbol: string | null, address: string }
      }
      state: {
        collateralUsd: number | null
        borrowAssetsUsd: number | null
      } | null
    }>
  }
}

interface BlacklistEntry {
  chainId: number
  uniqueKey: string
}

interface UnhealthyMarketEntry extends BlacklistEntry {
  severity: 'black'
  reason: 'unhealthy_borrowers'
  unhealthyBorrowUsd: number
  unhealthyCollateralUsd: number
  unhealthyBorrowerCount: number
  minHealthFactor: number
  thresholdUsd: number
  generatedAt: string
  collateralSymbol?: string
  loanSymbol?: string
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildMarketSlug(collateralSymbol: string, loanSymbol: string) {
  return slugify(`${collateralSymbol}-${loanSymbol}`)
}

function resolveAssetLabel(asset: { symbol: string | null, address: string } | null) {
  if (!asset)
    return 'unknown'

  const fallback = asset.address.slice(0, 6)
  return asset.symbol && asset.symbol.trim() ? asset.symbol : fallback
}

async function fetchMarkets(skip: number) {
  const query = `
    query EnumerateMarkets($first: Int!, $skip: Int!) {
      markets(first: $first, skip: $skip) {
        items {
          uniqueKey: marketId
          morphoBlue { chain { id } }
          collateralAsset { symbol address }
          loanAsset { symbol address }
          warnings { type level }
        }
      }
    }
  `

  const response = await fetch(MORPHO_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        first: PAGE_SIZE,
        skip,
      },
    }),
  })

  if (!response.ok)
    throw new Error(`GraphQL request failed (${response.status})`)

  const payload = (await response.json()) as { data?: MarketsResponse, errors?: unknown }
  if (!payload.data)
    throw new Error(`GraphQL response missing data: ${JSON.stringify(payload.errors ?? {})}`)

  return payload.data.markets.items
}

async function fetchUnhealthyPositions(skip: number) {
  const query = `
    query EnumerateUnhealthyPositions($first: Int!, $skip: Int!) {
      marketPositions(
        first: $first
        skip: $skip
        orderBy: HealthFactor
        orderDirection: Asc
        where: { healthFactor_lte: 1, borrowShares_gte: "1", marketListed: true }
      ) {
        items {
          healthFactor
          market {
            marketId
            morphoBlue { chain { id } }
            collateralAsset { symbol address }
            loanAsset { symbol address }
          }
          state {
            collateralUsd
            borrowAssetsUsd
          }
        }
      }
    }
  `

  const response = await fetch(MORPHO_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        first: PAGE_SIZE,
        skip,
      },
    }),
  })

  if (!response.ok)
    throw new Error(`GraphQL unhealthy positions request failed (${response.status})`)

  const payload = (await response.json()) as { data?: UnhealthyMarketPositionResponse, errors?: unknown }
  if (!payload.data)
    throw new Error(`GraphQL unhealthy positions response missing data: ${JSON.stringify(payload.errors ?? {})}`)

  return payload.data.marketPositions.items
}

async function fetchGeneratedUnhealthyMarkets(generatedAt: string) {
  const byMarket = new Map<string, UnhealthyMarketEntry>()
  let skip = 0

  while (true) {
    const items = await fetchUnhealthyPositions(skip)
    if (items.length === 0)
      break

    for (const position of items) {
      const borrowUsd = position.state?.borrowAssetsUsd ?? 0
      if (!Number.isFinite(borrowUsd) || borrowUsd < MIN_UNHEALTHY_POSITION_BORROW_USD)
        continue

      const chainId = position.market.morphoBlue.chain.id
      const uniqueKey = position.market.marketId.toLowerCase()
      const key = `${chainId}:${uniqueKey}`
      const existing = byMarket.get(key)
      const healthFactor = position.healthFactor ?? Number.POSITIVE_INFINITY
      const collateralUsd = position.state?.collateralUsd ?? 0

      if (existing) {
        existing.unhealthyBorrowUsd += borrowUsd
        existing.unhealthyCollateralUsd += Number.isFinite(collateralUsd) ? collateralUsd : 0
        existing.unhealthyBorrowerCount += 1
        existing.minHealthFactor = Math.min(existing.minHealthFactor, healthFactor)
        continue
      }

      byMarket.set(key, {
        chainId,
        uniqueKey,
        severity: 'black',
        reason: 'unhealthy_borrowers',
        unhealthyBorrowUsd: borrowUsd,
        unhealthyCollateralUsd: Number.isFinite(collateralUsd) ? collateralUsd : 0,
        unhealthyBorrowerCount: 1,
        minHealthFactor: healthFactor,
        thresholdUsd: UNHEALTHY_BORROW_USD_THRESHOLD,
        generatedAt,
        collateralSymbol: position.market.collateralAsset?.symbol ?? undefined,
        loanSymbol: position.market.loanAsset.symbol ?? undefined,
      })
    }

    if (items.length < PAGE_SIZE)
      break

    skip += PAGE_SIZE
  }

  return [...byMarket.values()]
    .filter(entry => entry.unhealthyBorrowUsd >= UNHEALTHY_BORROW_USD_THRESHOLD)
    .map(entry => ({
      ...entry,
      unhealthyBorrowUsd: Number(entry.unhealthyBorrowUsd.toFixed(2)),
      unhealthyCollateralUsd: Number(entry.unhealthyCollateralUsd.toFixed(2)),
      minHealthFactor: Number(entry.minHealthFactor.toFixed(6)),
    }))
    .sort((a, b) => a.chainId - b.chainId || b.unhealthyBorrowUsd - a.unhealthyBorrowUsd || a.uniqueKey.localeCompare(b.uniqueKey))
}

async function readManualBlacklist() {
  const file = Bun.file(MANUAL_INPUT_PATH)
  if (!(await file.exists()))
    return [] satisfies BlacklistEntry[]

  const parsed = await file.json()
  const entries = Array.isArray(parsed) ? parsed : []

  return entries.flatMap((entry): BlacklistEntry[] => {
    if (!entry || typeof entry !== 'object')
      return []

    const candidate = entry as Partial<BlacklistEntry>
    const chainId = Number(candidate.chainId)
    const uniqueKey = candidate.uniqueKey?.toLowerCase()

    if (!Number.isFinite(chainId) || chainId <= 0 || !uniqueKey)
      return []

    return [{ chainId, uniqueKey }]
  })
}

function mergeBlacklistEntries(...groups: BlacklistEntry[][]) {
  const entriesByKey = new Map<string, BlacklistEntry>()

  for (const entries of groups) {
    for (const entry of entries)
      entriesByKey.set(`${entry.chainId}:${entry.uniqueKey}`, entry)
  }

  return [...entriesByKey.values()]
    .sort((a, b) => a.chainId - b.chainId || a.uniqueKey.localeCompare(b.uniqueKey))
}

async function main() {
  const candidates: MarketCandidate[] = []
  const generatedAt = new Date().toISOString()
  let skip = 0

  while (true) {
    const items = await fetchMarkets(skip)
    if (items.length === 0)
      break

    for (const market of items) {
      const collateralLabel = resolveAssetLabel(market.collateralAsset)
      const loanLabel = resolveAssetLabel(market.loanAsset)
      const slug = buildMarketSlug(collateralLabel, loanLabel)
      candidates.push({
        chainId: market.morphoBlue.chain.id,
        uniqueKey: market.uniqueKey,
        slug,
        warnings: market.warnings ?? [],
      })
    }

    if (items.length < PAGE_SIZE)
      break

    skip += PAGE_SIZE
  }

  const generatedBlacklist = candidates
    .filter(candidate => candidate.warnings.some(warning => (
      warning.type === 'incorrect_oracle_configuration'
      || warning.type === 'bad_debt_unrealized'
      || warning.type === 'bad_debt_unrealized_market'
    )))
    .map(candidate => ({ chainId: candidate.chainId, uniqueKey: candidate.uniqueKey }))

  const manualBlacklist = await readManualBlacklist()
  const blacklist = mergeBlacklistEntries(generatedBlacklist, manualBlacklist)
  const unhealthyMarkets = await fetchGeneratedUnhealthyMarkets(generatedAt)

  await Bun.write(OUTPUT_PATH, JSON.stringify(blacklist, null, 2))
  await Bun.write(UNHEALTHY_OUTPUT_PATH, JSON.stringify(unhealthyMarkets, null, 2))
  console.log(`Wrote ${blacklist.length} markets to ${OUTPUT_PATH} (${generatedBlacklist.length} generated, ${manualBlacklist.length} manual).`)
  console.log(`Wrote ${unhealthyMarkets.length} unhealthy markets to ${UNHEALTHY_OUTPUT_PATH} (threshold $${UNHEALTHY_BORROW_USD_THRESHOLD}).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
