import { GraphQLClient, gql } from 'graphql-request'
import * as fs from 'fs'
import * as path from 'path'
import type { QueryMarketsResult, MorphoMarket } from '../app/lib/morpho-graphql.types'

// --- Enriched Market Type ---
interface EnrichedMarket extends MorphoMarket {
  chainId: number
  isStablecoinPair: boolean
  tvl: number
}

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
    chain(id: $chainId) { id }
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

// --- Corresponding TypeScript type for the above query result ---




const CHAIN_IDS = {
  ETHEREUM: 1,
  BASE: 8453,
  ARBITRUM: 42161,
  POLYGON: 137,
  HYPEREVM: 999,
}

const CHAIN_NAMES: { [key: number]: string } = {
  [CHAIN_IDS.ETHEREUM]: 'Ethereum',
  [CHAIN_IDS.BASE]: 'Base',
  [CHAIN_IDS.ARBITRUM]: 'Arbitrum',
  [CHAIN_IDS.POLYGON]: 'Polygon',
  [CHAIN_IDS.HYPEREVM]: 'HyperEVM',
}

// Configuration
const CONFIG = {
  // Which chains to fetch
  chainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE, CHAIN_IDS.ARBITRUM, CHAIN_IDS.POLYGON, CHAIN_IDS.HYPEREVM],
  minSupplyApy: 0.09, // 9% minimum APY (as decimal: 0.09 = 9%)
  maxSupplyApy: 2.0, // 200% maximum APY (filter out broken markets)
  minTvlUsd: 50000, // $50k minimum TVL
  maxUtilization: 0.99, // Max 99% utilization (filter out 100% utilized markets)
  batchSize: 100, // Fetch 100 markets per request
  maxMarketsPerChain: 500 // Limit markets per chain to avoid over-representing one chain
}

const CONFIG_CHEAP_BORROW = {
  maxSupplyApy: 0.10, // 200% maximum APY (filter out broken markets)
  minTvlUsd: 50000, // $50k minimum TVL
  maxUtilization: 0.99, // Max 99% utilization (filter out 100% utilized markets)
  batchSize: 100, // Fetch 100 markets per request
  maxMarketsPerChain: 500 // Limit markets per chain to avoid over-representing one chain
}

async function fetchMarkets(chainId: number): Promise<MorphoMarket[]> {
  console.log(`\nFetching markets for ${CHAIN_NAMES[chainId] || `Chain ${chainId}`}...`)
  let skip = 0
  let hasMore = true
  const marketsForChain: MorphoMarket[] = []

  while (hasMore && marketsForChain.length < CONFIG.maxMarketsPerChain) {
    try {
      const data = await client.request<QueryMarketsResult>(
        QUERY_MARKETS,
        {
          first: CONFIG.batchSize,
          skip,
          chainId: chainId,
          where: {
            chainId_in: [chainId],
            supplyApy_gte: CONFIG.minSupplyApy,
            supplyApy_lte: CONFIG.maxSupplyApy,
            supplyAssetsUsd_gte: CONFIG.minTvlUsd,
            // utilization_lte: CONFIG.maxUtilization
          },
          orderBy: 'SupplyApy',
          orderDirection: 'Desc'
        }
      )

      if (!data?.markets?.items || data.markets.items.length === 0) {
        hasMore = false
        continue
      }

      const markets = data.markets.items
      marketsForChain.push(...markets)
      
      console.log(`Fetched ${markets.length} markets (total for this chain: ${marketsForChain.length})`)

      if (markets.length < CONFIG.batchSize) {
        hasMore = false
      } else {
        skip += CONFIG.batchSize
      }
    } catch (error: any) {
      console.error(`Error fetching markets for chain ${chainId}:`, error.message)
      if (error.response?.errors) {
        console.error('GraphQL errors:', JSON.stringify(error.response.errors, null, 2))
      }
      hasMore = false // Stop fetching for this chain on error
    }
  }
  return marketsForChain
}

async function fetchCheapBorrowMarkets(chainId: number): Promise<MorphoMarket[]> {
  console.log(`\nFetching cheap borrow markets for ${CHAIN_NAMES[chainId] || `Chain ${chainId}`}...`)
  let skip = 0
  let hasMore = true
  const marketsForChain: MorphoMarket[] = []

  while (hasMore && marketsForChain.length < CONFIG_CHEAP_BORROW.maxMarketsPerChain) {
    try {
      const data = await client.request<QueryMarketsResult>(
        QUERY_MARKETS,
        {
          first: CONFIG_CHEAP_BORROW.batchSize,
          skip,
          chainId: chainId,
          where: {
            chainId_in: [chainId],
            supplyApy_lte: CONFIG_CHEAP_BORROW.maxSupplyApy,
            supplyAssetsUsd_gte: CONFIG_CHEAP_BORROW.minTvlUsd,
            // utilization_lte: CONFIG_CHEAP_BORROW.maxUtilization
          },
          orderBy: 'SupplyApy',
          orderDirection: 'Asc'
        }
      )

      if (!data?.markets?.items || data.markets.items.length === 0) {
        hasMore = false
        continue
      }

      const markets = data.markets.items
      marketsForChain.push(...markets)
      
      console.log(`Fetched ${markets.length} markets (total for this chain: ${marketsForChain.length})`)

      if (markets.length < CONFIG_CHEAP_BORROW.batchSize) {
        hasMore = false
      } else {
        skip += CONFIG_CHEAP_BORROW.batchSize
      }
    } catch (error: any) {
      console.error(`Error fetching markets for chain ${chainId}:`, error.message)
      if (error.response?.errors) {
        console.error('GraphQL errors:', JSON.stringify(error.response.errors, null, 2))
      }
      hasMore = false // Stop fetching for this chain on error
    }
  }
  return marketsForChain
}

async function generateCuratedMarkets() {
  console.log('Fetching markets from Morpho Blue API...')
  const chainNames = CONFIG.chainIds.map(id => CHAIN_NAMES[id] || `Chain ${id}`).join(', ')
  console.log(`Chains: ${chainNames}`)
  console.log(`APY Range: ${(CONFIG.minSupplyApy * 100).toFixed(1)}% - ${(CONFIG.maxSupplyApy * 100).toFixed(0)}%`)
  console.log(`Min TVL: $${CONFIG.minTvlUsd.toLocaleString()}`)
  console.log(`Max Utilization: ${(CONFIG.maxUtilization * 100).toFixed(0)}%`)

  try {
    // Step 1: Fetch all markets in parallel
    const marketPromises = CONFIG.chainIds.map(chainId => fetchMarkets(chainId))
    const results = await Promise.allSettled(marketPromises)

    // Step 2: Enrich and concatenate markets
    let allMarkets: MorphoMarket[] = []
    const enrichedMarkets: EnrichedMarket[] = []

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const chainId = CONFIG.chainIds[index]
        const markets = result.value
        allMarkets.push(...markets)
        
        markets.forEach(market => {
          enrichedMarkets.push({
            ...market,
            chainId: chainId,
            isStablecoinPair: isStablecoinPair(market),
            tvl: calculateTVL(market)
          })
        })
      } else {
        console.error(`Failed to fetch markets for chain ${CONFIG.chainIds[index]}:`, result.reason)
      }
    })

    const cheapBorrowMarkets = await fetchCheapBorrowMarkets(CHAIN_IDS.BASE)
    const enrichedCheapBorrowMarkets = cheapBorrowMarkets.filter(market => market.collateralAsset !== null).map(market => ({
      ...market,
      chainId: CHAIN_IDS.BASE,
      isStablecoinPair: isStablecoinPair(market),
      tvl: calculateTVL(market)
    }))

    console.log('CHEAP BORROW MARKETS')
    recapMarkets(enrichedCheapBorrowMarkets)

    allMarkets.push(...enrichedCheapBorrowMarkets)
    enrichedMarkets.push(...enrichedCheapBorrowMarkets)

    console.log(`\nTotal fetched: ${allMarkets.length} markets across all chains.`)

    // Step 3: Sort the enriched markets
    enrichedMarkets.sort(compareMarkets)

    // Step 4: Recap and write to file
    recapMarkets(enrichedMarkets)
    writeMarkets(enrichedMarkets, allMarkets.length)

  } catch (error: any) {
    console.error('Failed to generate curated markets:', error.message)
    throw error
  }
}

function isStablecoinPair(market: MorphoMarket): boolean {
  return STABLECOIN_SYMBOLS.includes(market.loanAsset.symbol.toUpperCase()) ||
         STABLECOIN_SYMBOLS.includes(market.collateralAsset!.symbol.toUpperCase())
}

function calculateTVL(market: MorphoMarket): number {
  // Prefer USD values from API, fallback to raw asset amounts
  return Number(market.state.supplyAssetsUsd) || Number(market.state.supplyAssets) || 0
}

// Simple comparison function for sorting
function compareMarkets(a: MorphoMarket, b: MorphoMarket): number {
  // Sort by APY first (highest first)
  if (b.state.supplyApy !== a.state.supplyApy) {
    return b.state.supplyApy - a.state.supplyApy
  }
  // Then by TVL (highest first)
  return calculateTVL(b) - calculateTVL(a)
}

function writeMarkets(curatedMarkets: EnrichedMarket[], totalFetched: number) {
  const outputPath = path.join(__dirname, '..', 'public', 'curated-markets.json')

  const output = {
    generatedAt: new Date().toISOString(),
    totalMarkets: totalFetched,
    curatedCount: curatedMarkets.length,
    criteria: {
      chains: CONFIG.chainIds.map(id => `${CHAIN_NAMES[id]} (${id})`),
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
      tvl: "USD value",
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
        name: market.loanAsset.name || '',
        decimals: market.loanAsset.decimals || 18
      },
      collateralToken: {
        address: market.collateralAsset.address,
        symbol: market.collateralAsset.symbol,
        name: market.collateralAsset.name || '',
        decimals: market.collateralAsset.decimals || 18
      },
      metrics: {
        // Raw values (original from API)
        tvl: market.state.supplyAssetsUsd || 0,
        totalSupply: market.state.supplyAssets,
        totalBorrow: market.state.borrowAssets,
        supplyApy: market.state.supplyApy,
        borrowApy: market.state.borrowApy,
        utilization: market.state.utilization,
        isStablecoinPair: market.isStablecoinPair,
        
        // Human-readable formatted values
        supplyApyFormatted: `${(market.state.supplyApy * 100).toFixed(2)}%`,
        borrowApyFormatted: `${(market.state.borrowApy * 100).toFixed(2)}%`,
        utilizationFormatted: `${(market.state.utilization * 100).toFixed(2)}%`,
        lltvFormatted: `${(Number(market.lltv) / 1e18 * 100).toFixed(2)}%`,
        tvlFormatted: `$${(market.state.supplyAssetsUsd || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      },
      whitelisted: market.whitelisted,
      createdAt: market.creationTimestamp
    }))
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\nCurated markets saved to ${outputPath}`)
}

function recapMarkets(curatedMarkets: EnrichedMarket[]) {
  console.log(`\nCurated ${curatedMarkets.length} interesting markets`)

  const whitelisted = curatedMarkets.filter(m => m.whitelisted).length
  const unwhitelisted = curatedMarkets.length - whitelisted
  
  console.log(`- Whitelisted: ${whitelisted}`)
  console.log(`- Unwhitelisted: ${unwhitelisted}`)

  // Log top 30 markets for reference
  console.log('\n=== Top 30 Markets (sorted by APY, then TVL) ===')
  curatedMarkets.slice(0, 30).forEach((market, index) => {
    const chainTag = CHAIN_NAMES[market.chainId] || `Chain ${market.chainId}`
    const tvlUsd = market.state.supplyAssetsUsd || 0
    
    const tvlFormatted = tvlUsd >= 1000000 
      ? `$${(tvlUsd / 1000000).toFixed(2)}M` 
      : tvlUsd >= 1000
      ? `$${(tvlUsd / 1000).toFixed(2)}K`
      : `$${tvlUsd.toFixed(0)}`
    
    const pairName = `${market.collateralAsset!.symbol}/${market.loanAsset.symbol}`.padEnd(25).slice(0, 25)
    const apyStr = `APY: ${(market.state.supplyApy * 100).toFixed(2)}%`.padEnd(18)
    const tvlStr = `TVL: ${tvlFormatted}`.padEnd(20)
    const utilStr = `Util: ${(market.state.utilization * 100).toFixed(1)}%`.padEnd(15)
    const lltvStr = `LLTV: ${(Number(market.lltv) / 1e18 * 100).toFixed(0)}%`.padEnd(12)
    
    console.log(
      `${(index + 1).toString().padStart(2)}. ${pairName}${apyStr}${tvlStr}${utilStr}${lltvStr}${chainTag}`
    )
  })

  if (curatedMarkets.length === 0) {
    console.log('\nNo markets to summarize.')
    return
  }

  // Summary stats
  const stablecoinMarkets = curatedMarkets.filter(m => m.isStablecoinPair).length
  const avgApy = curatedMarkets.reduce((sum, m) => sum + m.state.supplyApy, 0) / curatedMarkets.length
  const avgTvl = curatedMarkets.reduce((sum, m) => sum + (m.state.supplyAssetsUsd || 0), 0) / curatedMarkets.length
  
  console.log('\n=== Summary ===')
  console.log(`Total curated markets: ${curatedMarkets.length}`)
  console.log(`Stablecoin pairs: ${stablecoinMarkets}`)
  console.log(`Average APY: ${(avgApy * 100).toFixed(2)}%`)
  console.log(`Average TVL: $${avgTvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
}

// Run the script
generateCuratedMarkets().catch(console.error)
