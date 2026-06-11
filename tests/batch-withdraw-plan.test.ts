import { describe, expect, test } from 'bun:test'
import { buildBatchWithdrawMarketItems, buildBatchWithdrawPlan } from '../app/pages/home/batch-withdraw/batch-withdraw-plan'

const MARKET_ID = '0x1111111111111111111111111111111111111111111111111111111111111111' as const

function marketPosition(args: {
  totalSupplyAssets: bigint
  totalSupplyShares: bigint
  totalBorrowAssets: bigint
  userSupplyShares: bigint
}) {
  const selectedOption = {
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'TEST',
    decimals: 18,
  }
  const selectedUserMarkets = [{
    market: {
      uniqueKey: MARKET_ID,
      irmAddress: '0x0000000000000000000000000000000000000002',
      loanAsset: {
        address: selectedOption.address,
        symbol: selectedOption.symbol,
        decimals: selectedOption.decimals,
      },
      collateralAsset: {
        address: '0x0000000000000000000000000000000000000003',
        symbol: 'COL',
        decimals: 18,
      },
      state: {
        supplyAssets: String(args.totalSupplyAssets),
        supplyShares: String(args.totalSupplyShares),
        netSupplyApy: 0,
        utilization: 0,
      },
    },
    userState: {
      supplyShares: args.userSupplyShares,
      borrowShares: 0n,
      collateral: 0n,
    },
  }] as any

  const marketReads = [{
    status: 'success',
    result: {
      totalSupplyAssets: args.totalSupplyAssets,
      totalSupplyShares: args.totalSupplyShares,
      totalBorrowAssets: args.totalBorrowAssets,
      totalBorrowShares: args.totalBorrowAssets,
      lastUpdate: 1n,
      fee: 0n,
    },
  }]
  const rateReads = [{ status: 'success', result: 0n }]

  return buildBatchWithdrawMarketItems({
    selectedOption,
    selectedUserMarkets,
    marketReads,
    rateReads,
    nowSec: 1n,
  })
}

describe('batch withdraw planner', () => {
  test('uses Morpho virtual-share math for liquidity-limited max withdraws', () => {
    const computedMarkets = marketPosition({
      totalSupplyAssets: 100n,
      totalSupplyShares: 200_000_000n,
      totalBorrowAssets: 60n,
      userSupplyShares: 200_000_000n,
    })

    expect(computedMarkets.ok).toBe(true)
    if (!computedMarkets.ok)
      return

    const [item] = computedMarkets.items
    expect(item.suppliedAssets).toBe(100n)
    expect(item.liquidityAssets).toBe(40n)
    expect(item.maxWithdrawAssets).toBe(39n)

    const plan = buildBatchWithdrawPlan({
      computedMarkets,
      selectedOption: {
        address: '0x0000000000000000000000000000000000000001',
        symbol: 'TEST',
        decimals: 18,
      },
      parsedWithdrawAssets: 40n,
    })

    expect(plan.ok).toBe(true)
    expect(plan.totalWithdrawable).toBe(39n)
    expect(plan.items[0]?.plannedWithdrawAssets).toBe(39n)
    expect(plan.items[0]?.plannedWithdrawAssets).toBeLessThanOrEqual(plan.items[0]?.liquidityAssets ?? 0n)
  })

  test('still permits a full exit when the market has enough liquidity', () => {
    const computedMarkets = marketPosition({
      totalSupplyAssets: 100n,
      totalSupplyShares: 200_000_000n,
      totalBorrowAssets: 0n,
      userSupplyShares: 200_000_000n,
    })

    expect(computedMarkets.ok).toBe(true)
    if (!computedMarkets.ok)
      return

    const [item] = computedMarkets.items
    expect(item.suppliedAssets).toBe(100n)
    expect(item.maxWithdrawAssets).toBe(100n)
    expect(item.maxWithdrawShares).toBe(item.userSupplyShares)
  })
})
