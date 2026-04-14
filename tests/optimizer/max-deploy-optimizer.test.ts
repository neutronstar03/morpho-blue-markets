import { describe, expect, test } from 'bun:test'
import { optimizeMaxDeployWithPositions } from '../../app/lib/optimizer/supply-optimizer-max-deploy'

// Helper: create a simple market snapshot with a linear-like supply APR curve.
// At 0% utilization: borrow rate = rateAtTarget, supply APR = 0
// At high utilization: supply APR increases proportionally.
function makeMarket(args: {
  marketId?: string
  totalSupplyAssets?: bigint
  totalBorrowAssets?: bigint
  rateAtTarget?: bigint
  feeWad?: bigint
  lastUpdate?: bigint
}) {
  return {
    marketId: (args.marketId ?? '0xaaa') as `0x${string}`,
    uniqueKey: args.marketId ?? '0xaaa',
    totalSupplyAssets: args.totalSupplyAssets ?? 1000n,
    totalBorrowAssets: args.totalBorrowAssets ?? 500n,
    rateAtTarget: args.rateAtTarget ?? 500_000_000_000_000_000n, // 50% borrow rate at target
    feeWad: args.feeWad ?? 0n,
    lastUpdate: args.lastUpdate ?? 0n,
  }
}

describe('Max Deploy optimizer', () => {
  test('holds positions above base rate and does not withdraw', () => {
    // Market A: 8% supply APR at current position, above base rate of 5%
    // Market B: 3% supply APR at current position, below base rate of 5%
    // With fallbackAprWad = 5%, the optimizer should:
    // - Hold position in A (not withdraw)
    // - Withdraw from B (below base rate)
    // - Redeploy withdrawn funds + new deposit into the best available market

    const marketA = makeMarket({
      marketId: '0xaaaa',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 8000n, // 80% utilization → high supply APR
      rateAtTarget: 200_000_000_000_000_000n, // 20% borrow at target
    })

    const marketB = makeMarket({
      marketId: '0xbbbb',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 2000n, // 20% utilization → low supply APR
      rateAtTarget: 50_000_000_000_000_000n, // 5% borrow at target
    })

    // User has 1000 in A and 1000 in B
    const baseRate5Pct = 5n * (10n ** 16n) // 5% APR in WAD

    const result = optimizeMaxDeployWithPositions({
      markets: [marketA, marketB],
      positions: [
        { marketId: '0xaaaa' as `0x${string}`, suppliedAssets: 1000n },
        { marketId: '0xbbbb' as `0x${string}`, suppliedAssets: 1000n },
      ],
      newDepositAssets: 500n, // Additional 500 to deploy
      stepAssets: 100n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: baseRate5Pct,
        minSupplyAprWad: baseRate5Pct,
        minNewMarketAssets: 100n,
      },
      allowRebalance: true,
      maxIterations: 200,
    })

    // Find market rows
    const marketARow = result.positions.find(p => p.marketId === '0xaaaa')
    const marketBRow = result.positions.find(p => p.marketId === '0xbbbb')

    expect(marketARow).toBeDefined()
    expect(marketBRow).toBeDefined()

    // Market A: should hold position (not withdraw) since APR > 5%
    // deltaAssets should be >= 0 (no withdrawal)
    expect(marketARow!.deltaAssets >= 0n).toBe(true)

    // Market B: should withdraw since APR < 5%
    // deltaAssets should be <= 0 (withdrawal) or 0
    expect(marketBRow!.deltaAssets <= 0n).toBe(true)

    // Total allocated should be reasonable (2000 existing + 500 new = 2500)
    expect(result.optimized.totalAssets).toBeGreaterThan(0n)
  })

  test('falls back to wallet when no market exceeds base rate', () => {
    // Two markets, both with 0% supply APR (0 borrows)
    const marketA = makeMarket({
      marketId: '0xaaaa',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 0n, // 0% utilization → 0% supply APR
    })

    const result = optimizeMaxDeployWithPositions({
      markets: [marketA],
      positions: [
        { marketId: '0xaaaa' as `0x${string}`, suppliedAssets: 1000n },
      ],
      newDepositAssets: 500n,
      stepAssets: 100n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: 5n * (10n ** 16n), // 5%
        minSupplyAprWad: 5n * (10n ** 16n),
      },
      allowRebalance: true,
      maxIterations: 100,
    })

    // With 0% APR in the market and 5% base rate, should withdraw to wallet
    const walletRow = result.positions.find(p => p.destinationKind === 'wallet')
    expect(walletRow).toBeDefined()
    expect(walletRow!.amountAssets).toBeGreaterThan(0n)
  })

  test('max-deploy defaults holdAboveAprWad to fallbackAprWad', () => {
    // When holdAboveAprWad is not explicitly set, it should default to fallbackAprWad.
    // This means markets above base rate should be held.

    const market = makeMarket({
      marketId: '0xaaaa',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 9000n, // 90% utilization → high APR
      rateAtTarget: 200_000_000_000_000_000n, // 20% borrow at target
    })

    // User has 1000 in this market at high APR
    // base rate = 5%
    const baseRate = 5n * (10n ** 16n)

    const result = optimizeMaxDeployWithPositions({
      markets: [market],
      positions: [
        { marketId: '0xaaaa' as `0x${string}`, suppliedAssets: 1000n },
      ],
      newDepositAssets: 0n,
      stepAssets: 50n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: baseRate,
        minSupplyAprWad: baseRate,
        // holdAboveAprWad not set — should default to fallbackAprWad
      },
      allowRebalance: true,
      maxIterations: 100,
    })

    const marketRow = result.positions.find(p => p.marketId === '0xaaaa')
    expect(marketRow).toBeDefined()

    // Should hold the 1000 position (no withdrawal) since APR > base rate
    expect(marketRow!.amountAssets).toBeGreaterThanOrEqual(1000n)
  })

  test('max-deploy can withdraw from market below base rate', () => {
    // Market with 0% supply APR, base rate 5%
    // Should withdraw all to wallet
    const market = makeMarket({
      marketId: '0xbbbb',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 0n, // 0% utilization
    })

    const baseRate = 5n * (10n ** 16n)

    const result = optimizeMaxDeployWithPositions({
      markets: [market],
      positions: [
        { marketId: '0xbbbb' as `0x${string}`, suppliedAssets: 500n },
      ],
      newDepositAssets: 0n,
      stepAssets: 100n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: baseRate,
        minSupplyAprWad: baseRate,
      },
      allowRebalance: true,
      maxIterations: 100,
    })

    // The result should move funds to wallet since market APR < base rate
    // The optimized blended APR should be at least the base rate
    expect(result.optimized.blendedAprWad).toBeGreaterThanOrEqual(baseRate)
  })

  test('max-deploy with new deposit allocates above base rate first', () => {
    // Market with decent APR, new deposit should go there
    const market = makeMarket({
      marketId: '0xcccc',
      totalSupplyAssets: 10000n,
      totalBorrowAssets: 8000n, // 80% utilization → decent APR
      rateAtTarget: 100_000_000_000_000_000n, // 10% borrow at target
    })

    const baseRate = 3n * (10n ** 16n) // 3%

    const result = optimizeMaxDeployWithPositions({
      markets: [market],
      positions: [],
      newDepositAssets: 1000n,
      stepAssets: 100n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: baseRate,
        minSupplyAprWad: baseRate,
      },
      maxIterations: 200,
    })

    const marketRow = result.positions.find(p => p.marketId === '0xcccc')
    expect(marketRow).toBeDefined()
    expect(marketRow!.amountAssets).toBeGreaterThan(0n)

    // Final APR should be above base rate
    expect(marketRow!.supplyAprAfterWad).toBeGreaterThan(baseRate)
  })
})
