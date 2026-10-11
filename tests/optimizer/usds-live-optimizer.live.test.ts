import { describe, expect, test } from 'bun:test'
import { gql } from 'graphql-request'
import { createPublicClient, formatUnits } from 'viem'
import { mainnet } from 'viem/chains'
import { graphqlClient } from '../../app/lib/graphql/client'
import { optimizeSupplyAllocationWithPositions } from '../../app/lib/optimizer/supply-optimizer'
import { ADAPTIVE_CURVE_IRM_ABI, MORPHO_BLUE_ABI, MORPHO_BLUE_MAINNET } from '../irm/abi'
import { makeMainnetTransport } from '../irm/rpc'

const USDS_MAINNET = '0xdC035D45d973E3EC169d2276DDab16f1e407384F'
const USDS_DECIMALS = 18

const TOTAL_AMOUNT_ASSETS = 100_000n * 10n ** 18n

// Fetch a large enough page size to keep requests low.
const PAGE_SIZE = 1000

interface GqlMarket {
  uniqueKey: string
  lltv: string
  oracleAddress: string
  irmAddress: string
  whitelisted: boolean
  morphoBlue: { chain: { id: number } }
  loanAsset: { address: string, symbol: string, decimals?: number | null }
  collateralAsset: { address: string, symbol: string, decimals?: number | null }
}

const QUERY_MARKETS_FOR_OPTIMIZER = gql`
  query GetMarketsForOptimizer(
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
        oracleAddress
        irmAddress
        whitelisted
        morphoBlue { chain { id } }
        loanAsset { address symbol decimals }
        collateralAsset { address symbol decimals }
      }
    }
  }
`

function normalizeMarketTuple(x: any) {
  if (Array.isArray(x) && x.length >= 6) {
    return {
      totalSupplyAssets: x[0] as bigint,
      totalSupplyShares: x[1] as bigint,
      totalBorrowAssets: x[2] as bigint,
      totalBorrowShares: x[3] as bigint,
      lastUpdate: x[4] as bigint,
      fee: x[5] as bigint,
    }
  }
  return x as {
    totalSupplyAssets: bigint
    totalSupplyShares: bigint
    totalBorrowAssets: bigint
    totalBorrowShares: bigint
    lastUpdate: bigint
    fee: bigint
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size)
    out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllMainnetMarkets(): Promise<GqlMarket[]> {
  return fetchMarkets(mainnet, { loanAssetAddresses: [USDS_MAINNET] })
}

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
      QUERY_MARKETS_FOR_OPTIMIZER,
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

function pctFromWad(wad: bigint, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(wad, 18)) * 100
  if (!Number.isFinite(asNum))
    return 'NaN'
  return `${asNum.toFixed(digits)}%`
}

function fmtToken(amount: bigint, decimals = USDS_DECIMALS, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(asNum))
    return 'NaN'
  return asNum.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtUtil(utilWad: bigint, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(utilWad, 18)) * 100
  if (!Number.isFinite(asNum))
    return 'NaN'
  return `${asNum.toFixed(digits)}%`
}

describe('Optimizer (live mainnet) — USDS 100k greedy allocation', () => {
  test('prints plausible allocations + estimated supply APR per position', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    // Pin a block for deterministic onchain reads + timestamp.
    const blockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber })
    const timestamp = block.timestamp

    const usdsMarkets = await fetchAllMainnetMarkets()

    console.warn(`Pinned block: ${blockNumber} (timestamp=${timestamp})`)
    console.warn(`USDS candidate markets:     ${usdsMarkets.length}`)
    console.warn(`USDS total to allocate:     ${fmtToken(TOTAL_AMOUNT_ASSETS)} USDS`)

    expect(usdsMarkets.length).toBeGreaterThan(0)

    // Multicall in chunks to avoid oversized payloads:
    // We do 2 calls per market: Morpho.market(id) + IRM.rateAtTarget(id)
    const snapshot: Array<{
      marketId: `0x${string}`
      uniqueKey: string
      totalSupplyAssets: bigint
      totalBorrowAssets: bigint
      lastUpdate: bigint
      feeWad: bigint
      rateAtTarget: bigint
      meta: { collateralSymbol: string, lltv: string, irm: string }
    }> = []

    const contracts = usdsMarkets.flatMap((m) => {
      const id = m.uniqueKey as `0x${string}`
      return [
        {
          address: MORPHO_BLUE_MAINNET,
          abi: MORPHO_BLUE_ABI,
          functionName: 'market',
          args: [id] as const,
        },
        {
          address: m.irmAddress as `0x${string}`,
          abi: ADAPTIVE_CURVE_IRM_ABI,
          functionName: 'rateAtTarget',
          args: [id] as const,
        },
      ] as const
    })

    // 200 contract calls per multicall == 100 markets per chunk.
    const contractChunks = chunk(contracts, 200)
    const results: Array<{ status: 'success' | 'failure', result?: unknown }> = []

    for (const c of contractChunks) {
      const chunkRes = await client.multicall({
        allowFailure: true,
        contracts: c as any,
        blockNumber,
      })
      results.push(...chunkRes)
    }

    for (let i = 0; i < usdsMarkets.length; i++) {
      const marketRes = results[2 * i]
      const rateRes = results[2 * i + 1]
      if (marketRes?.status !== 'success' || rateRes?.status !== 'success')
        continue

      const marketTuple = normalizeMarketTuple(marketRes.result)
      const rateAtTarget = rateRes.result as bigint

      // Basic sanity: skip if timestamp < lastUpdate (shouldn't happen for pinned block).
      if (timestamp < marketTuple.lastUpdate)
        continue

      snapshot.push({
        marketId: usdsMarkets[i].uniqueKey as `0x${string}`,
        uniqueKey: usdsMarkets[i].uniqueKey,
        totalSupplyAssets: marketTuple.totalSupplyAssets,
        totalBorrowAssets: marketTuple.totalBorrowAssets,
        lastUpdate: marketTuple.lastUpdate,
        feeWad: marketTuple.fee,
        rateAtTarget,
        meta: {
          collateralSymbol: usdsMarkets[i].collateralAsset?.symbol ?? 'COLL',
          lltv: usdsMarkets[i].lltv,
          irm: usdsMarkets[i].irmAddress,
        },
      })
    }

    console.warn(`Onchain snapshot markets:   ${snapshot.length}`)
    expect(snapshot.length).toBeGreaterThan(0)

    const stepAssets = TOTAL_AMOUNT_ASSETS / 100n // 100 steps default
    console.warn(`Greedy step size:           ${fmtToken(stepAssets)} USDS`)

    const res = optimizeSupplyAllocationWithPositions({
      markets: snapshot.map(s => ({
        marketId: s.marketId,
        uniqueKey: s.uniqueKey,
        totalSupplyAssets: s.totalSupplyAssets,
        totalBorrowAssets: s.totalBorrowAssets,
        lastUpdate: s.lastUpdate,
        feeWad: s.feeWad,
        rateAtTarget: s.rateAtTarget,
      })),
      positions: [],
      newDepositAssets: TOTAL_AMOUNT_ASSETS,
      stepAssets,
      timestamp,
      maxIterations: 500,
    })

    // Verbose report for plausibility checks.
    console.warn('')
    console.warn('=== Optimizer result (estimated next-block instantaneous supply APY) ===')
    console.warn(`Optimal positions:          ${res.positions.length}`)
    console.warn(`Iterations:                 ${res.iterations}`)
    console.warn(`Allocated:                  ${fmtToken(res.optimized.totalAssets)} / ${fmtToken(TOTAL_AMOUNT_ASSETS)} USDS`)
    if (res.unallocatedNewDepositAssets > 0n)
      console.warn(`Unallocated:                ${fmtToken(res.unallocatedNewDepositAssets)} USDS`)
    console.warn(`Blended APY:                ${pctFromWad(res.optimized.blendedApyWad, 2)}`)
    console.warn(`Blended APR (simple):       ${pctFromWad(res.optimized.blendedAprWad, 2)}`)
    console.warn('')

    const byId = new Map(snapshot.map(s => [s.marketId.toLowerCase(), s]))

    for (const a of res.positions) {
      const meta = byId.get(a.marketId.toLowerCase())?.meta
      const collateral = meta?.collateralSymbol ?? 'COLL'
      const lltvPct = meta?.lltv
        ? `${(Number.parseFloat(formatUnits(BigInt(meta.lltv), 18)) * 100).toFixed(2)}%`
        : 'n/a'

      console.warn(
        [
          `- market=${a.marketId}`,
          `alloc=${fmtToken(a.amountAssets)} USDS`,
          `utilAfter=${fmtUtil(a.utilizationAfterWad, 2)}`,
          `apyAfter=${pctFromWad(a.supplyApyAfterWad, 2)}`,
          `aprAfter=${pctFromWad(a.supplyAprAfterWad, 2)}`,
          `coll=${collateral}`,
          `lltv=${lltvPct}`,
        ].join(' | '),
      )
    }
    console.warn('=====================================================================')
    console.warn('')

    // Light assertions: this is intended to be inspected by a human.
    expect(res.positions.length).toBeGreaterThan(0)
    expect(res.optimized.totalAssets).toBe(TOTAL_AMOUNT_ASSETS)
    expect(res.unallocatedNewDepositAssets).toBe(0n)
    expect(res.optimized.blendedApyWad).toBeGreaterThanOrEqual(0n)
  }, { timeout: 120_000 })
})
