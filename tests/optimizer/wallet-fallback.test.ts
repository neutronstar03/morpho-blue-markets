import { describe, expect, test } from 'bun:test'
import { optimizeSupplyAllocationWithPositions } from '../../app/lib/optimizer/supply-optimizer'

describe('Optimizer wallet fallback', () => {
  test('withdraws low-APR market allocations to wallet when fallback APR is higher', () => {
    const marketId = '0x1111111111111111111111111111111111111111111111111111111111111111' as const

    const result = optimizeSupplyAllocationWithPositions({
      markets: [
        {
          marketId,
          uniqueKey: marketId,
          totalSupplyAssets: 100n,
          totalBorrowAssets: 0n,
          lastUpdate: 0n,
          feeWad: 0n,
          rateAtTarget: 0n,
        },
      ],
      positions: [
        {
          marketId,
          suppliedAssets: 100n,
        },
      ],
      newDepositAssets: 0n,
      stepAssets: 10n,
      timestamp: 0n,
      constraints: {
        fallbackAprWad: 100_000_000_000_000_000n,
        fallbackLabel: 'Withdraw to wallet',
      },
      allowRebalance: true,
      maxIterations: 100,
    })

    const marketRow = result.positions.find(p => p.destinationKind === 'market')
    const walletRow = result.positions.find(p => p.destinationKind === 'wallet')

    expect(marketRow).toBeDefined()
    expect(walletRow).toBeDefined()
    expect(marketRow?.amountAssets).toBe(0n)
    expect(marketRow?.deltaAssets).toBe(-100n)
    expect(walletRow?.amountAssets).toBe(100n)
    expect(walletRow?.label).toBe('Withdraw to wallet')
    expect(result.optimized.blendedAprWad).toBe(100_000_000_000_000_000n)
  })
})
