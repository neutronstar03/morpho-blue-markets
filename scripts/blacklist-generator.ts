import process from 'node:process'

const MORPHO_GRAPHQL_URL = 'https://blue-api.morpho.org/graphql'

const OUTPUT_PATH = 'app/lib/blacklist.markets.json'
const PAGE_SIZE = 200

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
          uniqueKey
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

async function main() {
  const candidates: MarketCandidate[] = []
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

  const blacklist = candidates
    .filter(candidate => candidate.warnings.some(warning => (
      warning.type === 'incorrect_oracle_configuration'
      || warning.type === 'bad_debt_unrealized'
      || warning.type === 'bad_debt_unrealized_market'
    )))
    .map(candidate => ({ chainId: candidate.chainId, uniqueKey: candidate.uniqueKey }))
    .sort((a, b) => a.chainId - b.chainId || a.uniqueKey.localeCompare(b.uniqueKey))

  await Bun.write(OUTPUT_PATH, JSON.stringify(blacklist, null, 2))
  console.log(`Wrote ${blacklist.length} markets to ${OUTPUT_PATH}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
