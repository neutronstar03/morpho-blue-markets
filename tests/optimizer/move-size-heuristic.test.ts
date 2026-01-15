import type { SupplyOptimizerMarketSnapshot, UserSupplyPosition } from '../../app/lib/optimizer/supply-optimizer'
import { describe, expect, test } from 'bun:test'
import { runSupplyOptimizer } from '../../app/lib/optimizer/supply-optimizer-runner'

async function loadFixture(): Promise<{
  markets: SupplyOptimizerMarketSnapshot[]
  positions: UserSupplyPosition[]
}> {
  const fixtureUrl = new URL('./fixtures/move-size-snapshot.json', import.meta.url)
  const text = await Bun.file(fixtureUrl).text()
  const fixture = JSON.parse(text) as {
    markets: Array<{
      marketId: string
      uniqueKey: string
      totalSupplyAssets: string
      totalBorrowAssets: string
      lastUpdate: string
      feeWad: string
      rateAtTarget: string
    }>
    positions: Array<{
      marketId: string
      suppliedAssets: string
    }>
  }

  const markets = fixture.markets.map(m => ({
    marketId: m.marketId as `0x${string}`,
    uniqueKey: m.uniqueKey as `0x${string}`,
    totalSupplyAssets: BigInt(m.totalSupplyAssets),
    totalBorrowAssets: BigInt(m.totalBorrowAssets),
    lastUpdate: BigInt(m.lastUpdate),
    feeWad: BigInt(m.feeWad),
    rateAtTarget: BigInt(m.rateAtTarget),
  }))

  const positions = fixture.positions.map(p => ({
    marketId: p.marketId as `0x${string}`,
    suppliedAssets: BigInt(p.suppliedAssets),
  }))

  return { markets, positions }
}

describe('Move size heuristic', () => {
  // Snapshot rationale:
  // - All markets have 0 borrow and rateAtTarget = 0, so APY is effectively 0 everywhere.
  // - This removes yield differences so the heuristic only tests iteration behavior.
  // - With total = 400 and maxIterations = 25, the smallest passing step is 17:
  //   400 / 16 = 25 (fails), 400 / 17 = 23 (passes).
  test('re-runs heuristic when cached step hits iteration cap', async () => {
    const { markets, positions } = await loadFixture()

    const result = runSupplyOptimizer({
      markets,
      positions,
      newDepositAssets: 0n,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations: 25,
      auto: true,
      stepAssets: 1n,
    })

    // 'Good' here means 'smallest step that converges under the cap'.
    // It does not mean 'best APY', because all markets have identical APY = 0.
    expect(result.status).toBe('success')
    expect(result.autoInfo?.fromHeuristic).toBe(true)
    expect(result.stepAssets).toBeGreaterThan(1n)
    expect(result.result?.iterations ?? 0).toBeLessThan(25)
  })

  test('picks the minimal passing step from snapshot', async () => {
    const { markets, positions } = await loadFixture()

    const result = runSupplyOptimizer({
      markets,
      positions,
      newDepositAssets: 0n,
      timestamp: 1n,
      constraints: { maxMarketsUsed: 1 },
      maxIterations: 25,
      auto: true,
    })

    // This is a deterministic iteration-based check:
    // total=400 and step=16 => 25 iterations (fails cap), step=17 => 23 iterations (passes).
    // The expected value only validates the heuristic's convergence target, not yield quality.
    expect(result.status).toBe('success')
    expect(result.stepAssets).toBe(17n)
    expect(result.result?.iterations ?? 0).toBeLessThan(25)
    expect(result.autoInfo?.attempts ?? 0).toBeGreaterThan(2)
  })
})
