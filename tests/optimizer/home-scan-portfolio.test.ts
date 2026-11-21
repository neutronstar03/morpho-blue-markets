import type { LiveMarketPosition } from '../../app/lib/morpho/live-position'
import { describe, expect, test } from 'bun:test'
import { getHomeScanPortfolio, MIN_HOME_SCAN_PRINCIPAL_USD } from '../../app/lib/optimizer/home-scan-portfolio'

function position({ shares, totalUsd, tokenUsd }: {
  shares: bigint
  totalUsd?: number
  tokenUsd?: number
}): LiveMarketPosition {
  const asset = { symbol: 'WETH', decimals: 18, address: '0x12' }
  return {
    market: {
      uniqueKey: '0x1234',
      irmAddress: '0x34',
      loanAsset: { ...asset, price: { usd: tokenUsd } },
      collateralAsset: asset,
      state: { supplyAssets: '1000000000000000000', supplyShares: '1000000000000000000000000', supplyAssetsUsd: totalUsd, netSupplyApy: 0, utilization: 0 },
    },
    userState: { supplyShares: shares, borrowShares: 0n, collateral: 0n },
  }
}

describe('home optimizer portfolio gate', () => {
  test('values dust without rounding it to zero and applies the floor to the whole asset', () => {
    const dust = position({ shares: 10n ** 18n, totalUsd: 2000 })
    expect(getHomeScanPortfolio([dust]).principalUsd).toBeCloseTo(0.002)
    expect(getHomeScanPortfolio([dust]).principalUsd!).toBeLessThan(MIN_HOME_SCAN_PRINCIPAL_USD)

    const partial = position({ shares: 3n * 10n ** 20n, tokenUsd: 2000 })
    expect(getHomeScanPortfolio([partial]).principalUsd!).toBeLessThan(MIN_HOME_SCAN_PRINCIPAL_USD)
    const portfolio = getHomeScanPortfolio([partial, partial])
    expect(portfolio.positions).toHaveLength(2)
    expect(portfolio.principalUsd).toBeCloseTo(1.2)
  })

  test('rejects an incomplete USD total while keeping tiny share-only rows out of the portfolio', () => {
    const priced = position({ shares: 10n ** 23n, totalUsd: 2000 })
    const unpriced = position({ shares: 10n ** 20n })
    expect(getHomeScanPortfolio([priced, unpriced]).principalUsd).toBeNull()
    expect(getHomeScanPortfolio([priced, position({ shares: 1n })])).toEqual(getHomeScanPortfolio([priced]))
  })
})
