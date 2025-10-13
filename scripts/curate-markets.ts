import { GraphQLClient, gql } from 'graphql-request'
import * as fs from 'fs'
import * as path from 'path'
import { type Market, type MarketResponse } from '../app/lib/types'

// Official Morpho Blue API endpoint
const MORPHO_API = 'https://blue-api.morpho.org/graphql'
const client = new GraphQLClient(MORPHO_API)

// Interfaces are now in app/lib/types.ts

// Enhanced stablecoin list including exotic ones
const STABLECOIN_SYMBOLS = [
  // Major stablecoins
  'USDC', 'USDT', 'DAI', 'FRAX', 'TUSD',
  // Exotic/algorithmic stablecoins
  'UST', 'MIM', 'LUSD', 'SUSD', 'GUSD', 'USDP', 'BUSD',
  'USDD', 'USDN', 'FEI', 'DOLA', 'BEAN', 'RAI',
  'sUSD', 'cUSD', 'EURS', 'EURT', 'USDK',
  // Yield-bearing stablecoins
  'ysUSDS', 'sDAI', 'sUSDS', 'USDS',
  // Other stables
  'USDM', 'GHO'
]

const QUERY_MARKETS = gql`
    query GetMarkets(
      $chainId: Int!
      $first: Int!
      $skip: Int!
      $where: MarketFilters
      $orderBy: MarketOrderBy
      $orderDirection: OrderDirection
    ) {
      chain(id: $chainId) { id }   # optional, for cache/namespacing
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
          oracleAddress
          irmAddress
          loanAsset { address symbol name decimals }
          collateralAsset { address symbol name decimals }
          state {
            supplyAssets
            borrowAssets
            supplyApy
            borrowApy
            utilization
            supplyAssetsUsd
            borrowAssetsUsd
          }
          whitelisted
          creationTimestamp
        }
      }
    }
  `;


const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453
}

// Configuration
const CONFIG = {
  // Which chains to fetch (can add more chains later)
  chainIds: [CHAIN_IDS.BASE], // Start with Base only
  minSupplyApy: 0.09, // 9% minimum APY (as decimal: 0.09 = 9%)
  maxSupplyApy: 2.0, // 200% maximum APY (filter out broken markets)
  minTvlUsd: 10000, // $10k minimum TVL
  maxUtilization: 0.99, // Max 99% utilization (filter out 100% utilized markets)
  batchSize: 100, // Fetch 100 markets per request
  maxMarkets: 500 // Maximum markets to fetch (to avoid rate limits)
}

async function fetchAllMarkets(): Promise<Market[]> {
  console.log('Fetching markets from Morpho Blue API...')
  console.log(`Chains: ${CONFIG.chainIds.map(id => id === CHAIN_IDS.BASE ? 'Base' : 'Ethereum').join(', ')}`)
  console.log(`APY Range: ${(CONFIG.minSupplyApy * 100).toFixed(1)}% - ${(CONFIG.maxSupplyApy * 100).toFixed(0)}%`)
  console.log(`Min TVL: $${CONFIG.minTvlUsd.toLocaleString()}`)
  console.log(`Max Utilization: ${(CONFIG.maxUtilization * 100).toFixed(0)}%`)

  const allMarkets: Market[] = []
  let skip = 0
  let hasMore = true

  try {
    while (hasMore && allMarkets.length < CONFIG.maxMarkets) {
      const data = await client.request<MarketResponse>(
        QUERY_MARKETS,
        {
          first: CONFIG.batchSize,
          skip,
          chainId: CONFIG.chainIds[0],
          where: {
            chainId_in: [CONFIG.chainIds[0]],
            supplyApy_gte: CONFIG.minSupplyApy,
            supplyApy_lte: CONFIG.maxSupplyApy,
            supplyAssetsUsd_gte: CONFIG.minTvlUsd,
            // utilization_lte: CONFIG.maxUtilization
          },
          orderBy: 'SupplyApy', // Order by APY on server-side
          orderDirection: 'Desc'
        }
      )

      const markets = data.markets.items
      allMarkets.push(...markets)
      
      console.log(`Fetched ${markets.length} markets (total: ${allMarkets.length})`)
      
      // Check if there are more markets to fetch
      if (markets.length < CONFIG.batchSize) {
        hasMore = false
      } else {
        skip += CONFIG.batchSize
      }
    }

    console.log(`\nTotal fetched: ${allMarkets.length} markets`)
    return allMarkets

  } catch (error: any) {
    console.error('Error fetching markets:', error.message)
    if (error.response?.errors) {
      console.error('GraphQL errors:', JSON.stringify(error.response.errors, null, 2))
    }
    return allMarkets // Return what we got so far
  }
}

function isStablecoinPair(market: Market): boolean {
  return STABLECOIN_SYMBOLS.includes(market.loanAsset.symbol.toUpperCase()) ||
         STABLECOIN_SYMBOLS.includes(market.collateralAsset!.symbol.toUpperCase())
}

function calculateTVL(market: Market): number {
  // Prefer USD values from API, fallback to raw asset amounts
  return Number(market.state.supplyAssetsUsd) || Number(market.state.supplyAssets) || 0
}

// Simple comparison function for sorting
function compareMarkets(a: Market, b: Market): number {
  // Sort by APY first (highest first)
  if (b.state.supplyApy !== a.state.supplyApy) {
    return b.state.supplyApy - a.state.supplyApy
  }
  // Then by TVL (highest first)
  return calculateTVL(b) - calculateTVL(a)
}

function curateMarkets(markets: Market[]) {
  // Server-side filtering already done via GraphQL query
  // Just add metadata and sort
  return markets
    .map(market => ({
      ...market,
      isStablecoinPair: isStablecoinPair(market),
      tvl: calculateTVL(market)
    }))
    .sort(compareMarkets) // Sort by APY then TVL (in case server ordering isn't perfect)
}

async function generateCuratedMarkets() {
  try {
    const allMarkets = await fetchAllMarkets()
    
    console.log(`\nFetched ${allMarkets.length} total markets`)
    
    const whitelisted = allMarkets.filter(m => m.whitelisted).length
    const unwhitelisted = allMarkets.filter(m => !m.whitelisted).length
    
    console.log(`- Whitelisted: ${whitelisted}`)
    console.log(`- Unwhitelisted: ${unwhitelisted}`)

    // Curate markets
    const curatedMarkets = curateMarkets(allMarkets)

    console.log(`\nCurated ${curatedMarkets.length} interesting markets`)

    // Generate JSON file
    const outputPath = path.join(__dirname, '..', 'public', 'curated-markets.json')

    const output = {
      generatedAt: new Date().toISOString(),
      totalMarkets: allMarkets.length,
      curatedCount: curatedMarkets.length,
      criteria: {
        chains: CONFIG.chainIds.map(id => id === CHAIN_IDS.BASE ? 'Base (8453)' : 'Ethereum (1)'),
        minTvlUsd: CONFIG.minTvlUsd,
        minSupplyApy: CONFIG.minSupplyApy,
        sortBy: "APY (descending), then TVL (descending)",
        note: "Markets filtered and sorted by APY, then TVL"
      },
      fieldInfo: {
        note: "Decimal precision guide",
        supplyApy: "Decimal (0.15 = 15%)",
        borrowApy: "Decimal (0.15 = 15%)",
        utilization: "Decimal (0.75 = 75%)",
        tvl: "Raw token amount (depends on token decimals)",
        totalSupply: "Raw token amount",
        totalBorrow: "Raw token amount"
      },
      markets: curatedMarkets.map(market => ({
        id: market.uniqueKey,
        chainId: market.chainId,
        lltv: market.lltv,
        oracleAddress: market.oracleAddress,
        irmAddress: market.irmAddress,
        loanToken: {
          address: market.loanAsset.address,
          symbol: market.loanAsset.symbol,
          name: market.loanAsset.name,
          decimals: market.loanAsset.decimals
        },
        collateralToken: {
          address: market.collateralAsset!.address,
          symbol: market.collateralAsset!.symbol,
          name: market.collateralAsset!.name,
          decimals: market.collateralAsset!.decimals
        },
        metrics: {
          // Raw values (original from API)
          tvl: market.tvl,
          totalSupply: market.state.supplyAssets,
          totalBorrow: market.state.borrowAssets,
          supplyApy: market.state.supplyApy,
          borrowApy: market.state.borrowApy,
          utilization: market.state.utilization,
          isStablecoinPair: market.isStablecoinPair,
          
          // Human-readable formatted values
          // Note: API returns APY as decimal (0.05 = 5%)
          supplyApyFormatted: `${(market.state.supplyApy * 100).toFixed(2)}%`,
          borrowApyFormatted: `${(market.state.borrowApy * 100).toFixed(2)}%`,
          utilizationFormatted: `${(market.state.utilization * 100).toFixed(2)}%`,
          // LLTV is in wei (18 decimals): 980000000000000000 = 0.98 = 98%
          lltvFormatted: `${(Number(market.lltv) / 1e18 * 100).toFixed(2)}%`,
          // Format TVL - use USD value if available, otherwise format raw assets
          tvlFormatted: market.state.supplyAssetsUsd 
            ? `$${market.state.supplyAssetsUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : `${(Number(market.tvl) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens`
        },
        whitelisted: market.whitelisted,
        createdAt: market.creationTimestamp
      }))
    }

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
    console.log(`\nCurated markets saved to ${outputPath}`)

    // Log top 30 markets for reference
    console.log('\n=== Top 30 Markets (sorted by APY, then TVL) ===')
    curatedMarkets.slice(0, 30).forEach((market, index) => {
      const stableTag = market.isStablecoinPair ? ' [STABLE]' : ''
      const tvlFormatted = market.tvl >= 1000000 
        ? `$${(market.tvl / 1000000).toFixed(2)}M` 
        : market.tvl >= 1000
        ? `$${(market.tvl / 1000).toFixed(2)}K`
        : `$${market.tvl.toFixed(0)}`
      
      const pairName = `${market.loanAsset.symbol}/${market.collateralAsset!.symbol}`.padEnd(25)
      const apyStr = `APY: ${(market.state.supplyApy * 100).toFixed(2)}%`.padEnd(18)
      const tvlStr = `TVL: ${tvlFormatted}`.padEnd(20)
      const utilStr = `Util: ${(market.state.utilization * 100).toFixed(1)}%`.padEnd(15)
      const lltvStr = `LLTV: ${(Number(market.lltv) / 1e18 * 100).toFixed(0)}%`.padEnd(12)
      
      console.log(
        `${(index + 1).toString().padStart(2)}. ${pairName}${apyStr}${tvlStr}${utilStr}${lltvStr}${stableTag}`
      )
      
      // Show unique key for first 5 to debug duplicates
      if (index < 5) {
        console.log(`    ID: ${market.uniqueKey}`)
      }
    })

    // Summary stats
    const stablecoinMarkets = curatedMarkets.filter(m => m.isStablecoinPair).length
    const avgApy = curatedMarkets.reduce((sum, m) => sum + m.state.supplyApy, 0) / curatedMarkets.length
    const avgTvl = curatedMarkets.reduce((sum, m) => sum + m.tvl, 0) / curatedMarkets.length
    
    console.log('\n=== Summary ===')
    console.log(`Total curated markets: ${curatedMarkets.length}`)
    console.log(`Stablecoin pairs: ${stablecoinMarkets}`)
    console.log(`Average APY: ${(avgApy * 100).toFixed(2)}%`)
    console.log(`Average TVL: $${avgTvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)

  } catch (error: any) {
    console.error('Failed to generate curated markets:', error.message)
    throw error
  }
}

// Run the script
generateCuratedMarkets().catch(console.error)

