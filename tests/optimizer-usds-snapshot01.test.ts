import type { SupplyOptimizerMarketSnapshot, UserSupplyPosition } from '../app/lib/optimizer/supply-optimizer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'
import { formatUnits } from 'viem'
import { computeSupplyAfterDeltaWad, optimizeSupplyAllocationWithPositions } from '../app/lib/optimizer/supply-optimizer'

const BLOCK_NUMBER = 24164776n
const USDS_DECIMALS = 18n
const ONE_USDS = 10n ** USDS_DECIMALS

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

interface Position01Entry {
  market: { uniqueKey: string }
  userState: { supplyShares: string }
}

interface MarketsFixtureEntry {
  uniqueKey: string
  irmAddress: string
  lltv?: string | number
  collateralAsset?: { symbol?: string | null } | null
}

interface RpcSnapshotFixture {
  chainId: number
  blockNumber: string
  timestamp: string
  morphoBlue: string
  markets: Array<{
    marketId: `0x${string}`
    totalSupplyAssets: string
    totalSupplyShares: string
    totalBorrowAssets: string
    totalBorrowShares: string
    lastUpdate: string
    feeWad: string
    rateAtTarget: string
  }>
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
}

function toId(x: string): `0x${string}` {
  return x as `0x${string}`
}

function idKey(x: string): string {
  return x.toLowerCase()
}

function pctFromWad(wad: bigint, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(wad, 18)) * 100
  if (!Number.isFinite(asNum))
    return 'NaN'
  return `${asNum.toFixed(digits)}%`
}

function fmtToken(amount: bigint, decimals = USDS_DECIMALS, digits = 2): string {
  const asNum = Number.parseFloat(formatUnits(amount, Number(decimals)))
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

function lltvPct(lltv?: string | number): string {
  if (lltv == null)
    return 'n/a'
  try {
    const wad = BigInt(lltv as any)
    return `${(Number.parseFloat(formatUnits(wad, 18)) * 100).toFixed(2)}%`
  }
  catch {
    return 'n/a'
  }
}

describe('Optimizer (offline snapshot) — USDS @ block 24164776 with positions', () => {
  test('reproduces snapshot and runs optimizer deterministically (basic assertions)', () => {
    const marketsPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'markets', `usds-mainnet-${BLOCK_NUMBER}.json`)
    const positionsPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'positions', 'position01.json')
    const rpcPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'rpc', `usds-mainnet-${BLOCK_NUMBER}-onchain.json`)

    const marketsFixture = readJson<MarketsFixtureEntry[]>(marketsPath)
    const positionsFixture = readJson<Position01Entry[]>(positionsPath)
    const rpcFixture = readJson<RpcSnapshotFixture>(rpcPath)

    expect(rpcFixture.chainId).toBe(1)
    expect(BigInt(rpcFixture.blockNumber)).toBe(BLOCK_NUMBER)

    const timestamp = BigInt(rpcFixture.timestamp)

    // Build market snapshots from the RPC fixture (this is the authoritative pinned onchain state).
    const marketSnapshotById = new Map<string, SupplyOptimizerMarketSnapshot>()
    for (const m of rpcFixture.markets) {
      marketSnapshotById.set(idKey(m.marketId), {
        marketId: m.marketId,
        uniqueKey: m.marketId,
        totalSupplyAssets: BigInt(m.totalSupplyAssets),
        totalBorrowAssets: BigInt(m.totalBorrowAssets),
        lastUpdate: BigInt(m.lastUpdate),
        feeWad: BigInt(m.feeWad),
        rateAtTarget: BigInt(m.rateAtTarget),
      })
    }

    const metaById = new Map<string, { collateralSymbol?: string, lltv?: string | number }>()
    for (const m of marketsFixture) {
      metaById.set(idKey(m.uniqueKey), {
        collateralSymbol: m.collateralAsset?.symbol ?? undefined,
        lltv: m.lltv,
      })
    }

    // Universe = markets fixture, but only those we have pinned onchain data for.
    // (Optimizer requires that *all* user-position markets exist in `markets`.)
    const universe: SupplyOptimizerMarketSnapshot[] = []
    const seen = new Set<string>()
    for (const m of marketsFixture) {
      const id = idKey(m.uniqueKey)
      if (seen.has(id))
        continue
      seen.add(id)
      const snap = marketSnapshotById.get(id)
      if (snap)
        universe.push(snap)
    }

    // Derive UserSupplyPosition[] from supplyShares using pinned totals:
    // suppliedAssets = (userSupplyShares * totalSupplyAssets) / totalSupplyShares
    const positions: UserSupplyPosition[] = []
    for (const p of positionsFixture) {
      const marketId = toId(p.market.uniqueKey)
      const userSupplyShares = BigInt(p.userState.supplyShares)
      if (userSupplyShares <= 0n)
        continue

      const snap = marketSnapshotById.get(idKey(marketId))
      expect(snap, `Missing RPC snapshot for required marketId ${marketId}`).toBeTruthy()
      if (!snap)
        continue

      // Read totalSupplyShares from the RPC snapshot file (not part of optimizer input but needed for share->asset conversion).
      const rpcMarket = rpcFixture.markets.find(x => idKey(x.marketId) === idKey(marketId))
      expect(rpcMarket, `Missing RPC snapshot tuple for required marketId ${marketId}`).toBeTruthy()
      if (!rpcMarket)
        continue

      const totalSupplyAssets = BigInt(rpcMarket.totalSupplyAssets)
      const totalSupplyShares = BigInt(rpcMarket.totalSupplyShares)
      expect(totalSupplyAssets).toBeGreaterThan(0n)
      expect(totalSupplyShares).toBeGreaterThan(0n)

      const suppliedAssets = (userSupplyShares * totalSupplyAssets) / totalSupplyShares
      if (suppliedAssets <= 0n)
        continue

      positions.push({ marketId, suppliedAssets })
    }

    expect(positions.length).toBeGreaterThan(0)

    // Ensure the optimizer has snapshots for all position markets.
    // (If this fails, it means the RPC snapshot is incomplete.)
    const universeIds = new Set(universe.map(m => idKey(m.marketId)))
    for (const p of positions)
      expect(universeIds.has(idKey(p.marketId)), `Universe missing required position marketId ${p.marketId}`).toBe(true)

    const totalCurrentAssets = positions.reduce((acc, p) => acc + p.suppliedAssets, 0n)
    expect(totalCurrentAssets).toBeGreaterThan(0n)

    const rawStep = totalCurrentAssets / 100n
    const stepAssets = rawStep >= ONE_USDS ? rawStep : ONE_USDS

    // ---- Verbose human-readable report (intentionally noisy) ----
    console.warn('')
    console.warn('=== Offline optimizer snapshot (USDS) ===')
    console.warn(`Pinned block:               ${rpcFixture.blockNumber} (timestamp=${timestamp})`)
    console.warn(`Universe markets:           ${universe.length} (from markets fixture; only those with onchain snapshot)`)
    console.warn(`User position markets:      ${positions.length}`)
    console.warn(`Total supplied (derived):   ${fmtToken(totalCurrentAssets)} USDS`)
    console.warn(`Greedy step size:           ${fmtToken(stepAssets)} USDS`)
    console.warn('')

    // Market snapshot recap (sorted by snapshot APY desc, purely informational).
    const marketRecap = universe.map((m) => {
      const liq = m.totalSupplyAssets > m.totalBorrowAssets ? (m.totalSupplyAssets - m.totalBorrowAssets) : 0n
      const { utilizationAfterWad, supplyApyWad } = computeSupplyAfterDeltaWad({
        market: m,
        deltaSupplyAssets: 0n,
        timestamp,
      })
      return {
        marketId: m.marketId,
        apyWad: supplyApyWad,
        utilWad: utilizationAfterWad,
        liquidityAssets: liq,
        totalSupplyAssets: m.totalSupplyAssets,
        totalBorrowAssets: m.totalBorrowAssets,
      }
    }).sort((a, b) => (a.apyWad === b.apyWad ? 0 : (a.apyWad > b.apyWad ? -1 : 1)))

    console.warn('--- Snapshot markets (recap) ---')
    for (const r of marketRecap) {
      const meta = metaById.get(idKey(r.marketId))
      const collateral = meta?.collateralSymbol ?? 'COLL'
      console.warn(
        [
          `- market=${r.marketId}`,
          `coll=${collateral}`,
          `lltv=${lltvPct(meta?.lltv)}`,
          `supply=${fmtToken(r.totalSupplyAssets)} USDS`,
          `borrow=${fmtToken(r.totalBorrowAssets)} USDS`,
          `liq=${fmtToken(r.liquidityAssets)} USDS`,
          `util=${fmtUtil(r.utilWad, 2)}`,
          `apy=${pctFromWad(r.apyWad, 2)}`,
        ].join(' | '),
      )
    }
    console.warn('--------------------------------')
    console.warn('')

    const res = optimizeSupplyAllocationWithPositions({
      markets: universe,
      positions,
      newDepositAssets: 0n,
      stepAssets,
      timestamp,
      allowRebalance: true,
      maxIterations: 800,
    })

    console.warn('--- Portfolio ---')
    console.warn(`Current blended APY:        ${pctFromWad(res.current.blendedApyWad, 2)}`)
    console.warn(`Optimized blended APY:      ${pctFromWad(res.optimized.blendedApyWad, 2)}`)
    console.warn(`Iterations:                 ${res.iterations}`)
    if (res.infeasibleWithdrawAssets > 0n)
      console.warn(`Infeasible withdraw amount: ${fmtToken(res.infeasibleWithdrawAssets)} USDS`)
    console.warn('')

    for (const p of res.positions) {
      const meta = metaById.get(idKey(p.marketId))
      const collateral = meta?.collateralSymbol ?? 'COLL'
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
          `lltv=${lltvPct(meta?.lltv)}`,
        ].join(' | '),
      )
    }
    console.warn('----------------')
    console.warn('')

    // Basic invariants.
    expect(res.optimized.totalAssets).toBe(res.current.totalAssets)
    expect(res.optimized.totalAssets).toBe(totalCurrentAssets)
    expect(res.optimized.blendedApyWad).toBeGreaterThanOrEqual(0n)
    expect(res.infeasibleWithdrawAssets).toBeGreaterThanOrEqual(0n)
    expect(res.positions.length).toBeGreaterThan(0)
  })
})
