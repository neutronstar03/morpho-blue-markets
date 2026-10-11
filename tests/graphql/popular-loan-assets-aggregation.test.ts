import { describe, expect, test } from 'bun:test'
import { aggregatePopularLoanAssets } from '../../app/lib/hooks/graphql/use-popular-loan-assets-by-chain'

function item(address: string, symbol: string, borrowAssetsUsd: number | null, netSupplyApy: number | null) {
  return {
    marketId: `0x${address.slice(2).padEnd(64, '0')}`,
    uniqueKey: `0x${address.slice(2).padEnd(64, '0')}`,
    loanAsset: {
      address,
      symbol,
      name: symbol,
      decimals: 18,
      chain: { id: 1, network: 'Ethereum' },
      price: { usd: 1 },
    },
    state: { utilization: 0.5, borrowAssetsUsd, netSupplyApy },
  }
}

const ASSET_A = '0xaaaa000000000000000000000000000000000001'
const ASSET_B = '0xbbbb000000000000000000000000000000000002'
const ASSET_C = '0xcccc000000000000000000000000000000000003'
const ASSET_D = '0xdddd000000000000000000000000000000000004'

describe('aggregatePopularLoanAssets ordering', () => {
  test('sorts by borrowUSD-weighted APY, then by borrow USD, and drops zero-borrow assets', () => {
    const result = aggregatePopularLoanAssets([
      item(ASSET_A, 'AAA', 100, 0.1),
      item(ASSET_A, 'AAA', 300, 0.1),
      item(ASSET_B, 'BBB', 1000, 0.5),
      item(ASSET_C, 'CCC', 0, 0.9),
      item(ASSET_D, 'DDD', 2000, 0.5),
    ], 12)

    expect(result.map(x => x.symbol)).toEqual(['DDD', 'BBB', 'AAA'])
    expect(result[2]).toMatchObject({ symbol: 'AAA', borrowUsdSum: 400, marketCount: 2, averageApy: 0.1 })
    expect(result[0]).toMatchObject({ symbol: 'DDD', borrowUsdSum: 2000, marketCount: 1, averageApy: 0.5 })
  })

  test('applies topN after ordering', () => {
    const result = aggregatePopularLoanAssets([
      item(ASSET_A, 'AAA', 100, 0.1),
      item(ASSET_B, 'BBB', 1000, 0.5),
      item(ASSET_D, 'DDD', 2000, 0.5),
    ], 2)

    expect(result.map(x => x.symbol)).toEqual(['DDD', 'BBB'])
  })

  test('treats null metrics as zero-weighted without dropping a borrowing asset', () => {
    const result = aggregatePopularLoanAssets([
      item(ASSET_A, 'AAA', null, null),
      item(ASSET_B, 'BBB', 500, null),
    ], 12)

    expect(result.map(x => x.symbol)).toEqual(['BBB'])
  })
})
