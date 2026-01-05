import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gql } from 'graphql-request'
import { createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { graphqlClient } from '../../app/lib/graphql/client'
import { makeMainnetTransport } from '../irm/rpc'

const USDS_MAINNET = '0xdC035D45d973E3EC169d2276DDab16f1e407384F'
const PAGE_SIZE = 1000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')

interface GqlMarket {
  uniqueKey: string
  lltv: string
  irmAddress: string
  morphoBlue: { chain: { id: number } }
  loanAsset: { address: string, symbol: string, decimals?: number | null }
  collateralAsset: { address: string, symbol: string, decimals?: number | null }
}

const QUERY_MARKETS_MIN = gql`
  query GetMarketsForOptimizerPositions(
    $first: Int!
    $skip: Int!
    $where: MarketFilters
    $orderBy: MarketOrderBy
    $orderDirection: OrderDirection
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      items {
        uniqueKey
        lltv
        irmAddress
        morphoBlue { chain { id } }
        loanAsset { address symbol decimals }
        collateralAsset { address symbol decimals }
      }
    }
  }
`

async function fetchMarkets(
  network: { id: number },
  assets: { loanAssetAddresses?: string[], collateralAssetAddresses?: string[] },
): Promise<GqlMarket[]> {
  let all: GqlMarket[] = []
  let skip = 0
  let hasMore = true

  const where: Record<string, unknown> = { chainId_in: [network.id] }
  if (assets.loanAssetAddresses?.length)
    where.loanAssetAddress_in = assets.loanAssetAddresses
  if (assets.collateralAssetAddresses?.length)
    where.collateralAssetAddress_in = assets.collateralAssetAddresses

  while (hasMore) {
    const res = await graphqlClient.request<{ markets: { items: GqlMarket[] } }>(
      QUERY_MARKETS_MIN,
      {
        first: PAGE_SIZE,
        skip,
        // Filter server-side (case insensitive per schema) to avoid paging through all markets.
        where,
        orderBy: 'NetSupplyApy',
        orderDirection: 'Desc',
      },
    )
    const items = res.markets.items ?? []
    all = all.concat(items)
    if (items.length < PAGE_SIZE)
      hasMore = false
    else
      skip += PAGE_SIZE
  }
  return all
}

async function main() {
  const client = createPublicClient({
    chain: mainnet,
    transport: makeMainnetTransport(),
  })

  console.warn('Fetching current block number...')
  const blockNumber = await client.getBlockNumber()
  console.warn(`Current block number: ${blockNumber}`)

  console.warn('Fetching markets...')
  const markets = await fetchMarkets(mainnet, { loanAssetAddresses: [USDS_MAINNET] })
  console.warn(`Fetched ${markets.length} markets.`)

  const dir = path.join(REPO_ROOT, 'tests', 'fixtures', 'markets')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const filePath = path.join(dir, `usds-mainnet-${blockNumber}.json`)
  fs.writeFileSync(filePath, JSON.stringify(markets, null, 2))
  console.warn(`Saved markets to ${filePath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
