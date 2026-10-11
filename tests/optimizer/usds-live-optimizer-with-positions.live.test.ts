import type { UserSupplyPosition } from '../../app/lib/optimizer/supply-optimizer'
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

const NEW_DEPOSIT_ASSETS = 100_000n * 10n ** 18n

const PAGE_SIZE = 1000

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

describe('Optimizer (live mainnet) — USDS with existing positions', () => {
  test('prints current vs optimized blended APY + final deltas (liquidity-aware)', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    const blockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber })
    const timestamp = block.timestamp

    const usdsMarkets = await fetchAllMainnetMarkets()
    expect(usdsMarkets.length).toBeGreaterThan(0)

    // Same snapshot procedure as the other test.
    const snapshot: Array<{
      marketId: `0x${string}`
      uniqueKey: string
      totalSupplyAssets: bigint
      totalBorrowAssets: bigint
      lastUpdate: bigint
      feeWad: bigint
      rateAtTarget: bigint
      meta: { collateralSymbol: string, lltv: string }
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
        },
      })
    }

    expect(snapshot.length).toBeGreaterThan(0)

    // Example user positions (JSON-friendly structure would match this after parsing):
    // - includes the PEPE market from earlier runs
    // - plus another market to allow rebalancing decisions
    const positions: UserSupplyPosition[] = [
      {
        marketId: '0x5ffdf15c5a4d7c6affb3f12634eeda1a20e60b92c0eb547f61754f656b55841e',
        suppliedAssets: 50_000n * 10n ** 18n,
      },
      {
        marketId: '0x81b97c7305aca46c62f2ffce63a09c6a4d647163e25f31c44fadcbeab838b3f8',
        suppliedAssets: 10_000n * 10n ** 18n,
      },
    ]

    const stepAssets = NEW_DEPOSIT_ASSETS / 100n

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
      positions,
      newDepositAssets: NEW_DEPOSIT_ASSETS,
      stepAssets,
      timestamp,
      allowRebalance: true,
      maxIterations: 600,
    })

    console.warn('')
    console.warn('=== Optimizer with positions (liquidity-aware) ===')
    console.warn(`Pinned block:               ${blockNumber} (timestamp=${timestamp})`)
    console.warn(`Current supplied total:     ${fmtToken(res.current.totalAssets)} USDS`)
    console.warn(`New deposit:                ${fmtToken(NEW_DEPOSIT_ASSETS)} USDS`)
    console.warn(`Target total:               ${fmtToken(res.optimized.totalAssets)} USDS`)
    console.warn(`Current blended APY (pre):  ${pctFromWad(res.current.blendedApyWad, 2)}`)
    if (res.currentAtTargetProRata) {
      console.warn(`Current alloc APY @ target: ${pctFromWad(res.currentAtTargetProRata.blendedApyWad, 2)}`)
    }
    if (res.baselineNoRebalance) {
      console.warn(`Baseline (add-only) APY:    ${pctFromWad(res.baselineNoRebalance.blendedApyWad, 2)}`)
    }
    console.warn(`Optimized blended APY:      ${pctFromWad(res.optimized.blendedApyWad, 2)}`)
    console.warn(`Optimized blended APR:      ${pctFromWad(res.optimized.blendedAprWad, 2)}`)
    if (res.unallocatedNewDepositAssets > 0n)
      console.warn(`Unallocated new deposit:    ${fmtToken(res.unallocatedNewDepositAssets)} USDS`)
    if (res.infeasibleWithdrawAssets > 0n)
      console.warn(`Infeasible withdraw amount: ${fmtToken(res.infeasibleWithdrawAssets)} USDS`)
    console.warn('')

    for (const p of res.positions) {
      const meta = snapshot.find(s => s.marketId.toLowerCase() === p.marketId.toLowerCase())?.meta
      const collateral = meta?.collateralSymbol ?? 'COLL'
      const lltvPct = meta?.lltv
        ? `${(Number.parseFloat(formatUnits(BigInt(meta.lltv), 18)) * 100).toFixed(2)}%`
        : 'n/a'

      const deltaSign = p.deltaAssets >= 0n ? '+' : ''

      console.warn(
        [
          `- market=${p.marketId}`,
          `final=${fmtToken(p.amountAssets)} USDS`,
          `delta=${deltaSign}${fmtToken(p.deltaAssets)} USDS`,
          `cur=${fmtToken(p.currentUserAssets)} USDS`,
          `minFinal=${fmtToken(p.minFinalAssets)} USDS`,
          `maxWdraw=${fmtToken(p.maxWithdrawAssets)} USDS`,
          `utilAfter=${fmtUtil(p.utilizationAfterWad, 2)}`,
          `apyAfter=${pctFromWad(p.supplyApyAfterWad, 2)}`,
          `coll=${collateral}`,
          `lltv=${lltvPct}`,
        ].join(' | '),
      )
    }
    console.warn('===============================================')
    console.warn('')

    expect(res.optimized.totalAssets).toBe(res.current.totalAssets + NEW_DEPOSIT_ASSETS)
    expect(res.optimized.blendedApyWad).toBeGreaterThanOrEqual(0n)
  }, { timeout: 120_000 })

  test('fixture positions: prints current vs baseline vs optimized', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    const blockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber })
    const timestamp = block.timestamp

    const usdsMarkets = await fetchAllMainnetMarkets()
    expect(usdsMarkets.length).toBeGreaterThan(0)

    const snapshot: Array<{
      marketId: `0x${string}`
      uniqueKey: string
      totalSupplyAssets: bigint
      totalBorrowAssets: bigint
      lastUpdate: bigint
      feeWad: bigint
      rateAtTarget: bigint
      meta: { collateralSymbol: string, lltv: string }
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
        },
      })
    }

    expect(snapshot.length).toBeGreaterThan(0)

    // Fixture from Untitled-1 (strings -> bigint).
    const fixtureNewDepositAssets = BigInt(0)
    const fixtureAllowRebalance = true
    const fixturePositions: UserSupplyPosition[] = [
      {
        marketId: '0x5ffdf15c5a4d7c6affb3f12634eeda1a20e60b92c0eb547f61754f656b55841e',
        suppliedAssets: BigInt('89568190000000000000000'),
      },
      {
        marketId: '0x44f51e6b7356132597872e40c8d4a5bb2f1fc2c99e7292ee3b3953d9074086b6',
        suppliedAssets: BigInt('18605910000000000000000'),
      },
      {
        marketId: '0x973b23002efe233943715a2dfb98b66a0434d4b192b00bb4924230b3916433f7',
        suppliedAssets: BigInt('4729220000000000000000'),
      },
    ]

    const totalCurrentAssets = fixturePositions.reduce((acc, p) => acc + p.suppliedAssets, 0n)
    const baseAssets = fixtureNewDepositAssets > 0n ? fixtureNewDepositAssets : totalCurrentAssets
    const minStepAssets = 10n ** BigInt(USDS_DECIMALS) // 1 USDS

    // Quick sensitivity sweep: see whether step size / maxIterations materially changes the outcome.
    const configs = [
      { label: '1/100', stepDivisor: 100n, maxIterations: 800 },
      { label: '1/500', stepDivisor: 500n, maxIterations: 2000 },
      { label: '1/1000', stepDivisor: 1000n, maxIterations: 4000 },
    ] as const

    const resultsByConfig = configs.map((cfg) => {
      const rawStep = cfg.stepDivisor > 0n ? baseAssets / cfg.stepDivisor : 0n
      const stepAssets = rawStep >= minStepAssets ? rawStep : minStepAssets
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
        positions: fixturePositions,
        newDepositAssets: fixtureNewDepositAssets,
        stepAssets,
        timestamp,
        allowRebalance: fixtureAllowRebalance,
        maxIterations: cfg.maxIterations,
      })
      return { cfg, stepAssets, res }
    })

    console.warn('')
    console.warn('--- Sensitivity (fixture): stepDivisor / maxIterations ---')
    for (const r of resultsByConfig) {
      console.warn(
        [
          `${r.cfg.label} (maxIter=${r.cfg.maxIterations})`,
          `step=${fmtToken(r.stepAssets)} USDS`,
          `iters=${r.res.iterations}`,
          `optAPY=${pctFromWad(r.res.optimized.blendedApyWad, 2)}`,
        ].join(' | '),
      )
    }
    console.warn('---------------------------------------------------------')

    // Pick the best blended APY among the tried configs (within the same pinned snapshot).
    const best = resultsByConfig.reduce((a, b) =>
      b.res.optimized.blendedApyWad > a.res.optimized.blendedApyWad ? b : a,
    )
    const res = best.res

    console.warn('')
    console.warn('=== Optimizer fixture (Untitled-1) — liquidity-aware ===')
    console.warn(`Pinned block:               ${blockNumber} (timestamp=${timestamp})`)
    console.warn(`Config used:                ${best.cfg.label} (maxIter=${best.cfg.maxIterations}, step=${fmtToken(best.stepAssets)} USDS)`)
    console.warn(`Current supplied total:     ${fmtToken(res.current.totalAssets)} USDS`)
    console.warn(`New deposit:                ${fmtToken(fixtureNewDepositAssets)} USDS`)
    console.warn(`Target total:               ${fmtToken(res.optimized.totalAssets)} USDS`)
    console.warn(`Current blended APY (pre):  ${pctFromWad(res.current.blendedApyWad, 2)}`)
    if (res.currentAtTargetProRata) {
      console.warn(`Current alloc APY @ target: ${pctFromWad(res.currentAtTargetProRata.blendedApyWad, 2)}`)
    }
    if (res.baselineNoRebalance) {
      console.warn(`Baseline (add-only) APY:    ${pctFromWad(res.baselineNoRebalance.blendedApyWad, 2)}`)
    }
    console.warn(`Optimized blended APY:      ${pctFromWad(res.optimized.blendedApyWad, 2)}`)
    console.warn(`Optimized blended APR:      ${pctFromWad(res.optimized.blendedAprWad, 2)}`)
    if (res.unallocatedNewDepositAssets > 0n)
      console.warn(`Unallocated new deposit:    ${fmtToken(res.unallocatedNewDepositAssets)} USDS`)
    if (res.infeasibleWithdrawAssets > 0n)
      console.warn(`Infeasible withdraw amount: ${fmtToken(res.infeasibleWithdrawAssets)} USDS`)
    console.warn('')

    for (const p of res.positions) {
      const meta = snapshot.find(s => s.marketId.toLowerCase() === p.marketId.toLowerCase())?.meta
      const collateral = meta?.collateralSymbol ?? 'COLL'
      const lltvPct = meta?.lltv
        ? `${(Number.parseFloat(formatUnits(BigInt(meta.lltv), 18)) * 100).toFixed(2)}%`
        : 'n/a'

      const deltaSign = p.deltaAssets >= 0n ? '+' : ''

      console.warn(
        [
          `- market=${p.marketId}`,
          `final=${fmtToken(p.amountAssets)} USDS`,
          `delta=${deltaSign}${fmtToken(p.deltaAssets)} USDS`,
          `cur=${fmtToken(p.currentUserAssets)} USDS`,
          `minFinal=${fmtToken(p.minFinalAssets)} USDS`,
          `maxWdraw=${fmtToken(p.maxWithdrawAssets)} USDS`,
          `utilAfter=${fmtUtil(p.utilizationAfterWad, 2)}`,
          `apyAfter=${pctFromWad(p.supplyApyAfterWad, 2)}`,
          `coll=${collateral}`,
          `lltv=${lltvPct}`,
        ].join(' | '),
      )
    }
    console.warn('===============================================')
    console.warn('')

    expect(res.optimized.totalAssets).toBe(res.current.totalAssets + fixtureNewDepositAssets)
    expect(res.optimized.blendedApyWad).toBeGreaterThanOrEqual(0n)
  }, { timeout: 120_000 })
})
