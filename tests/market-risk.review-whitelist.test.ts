import { describe, expect, test } from 'bun:test'
import { getMarketRisk } from '../app/lib/market-risk/market-risk'

const MAINNET_CHAIN_ID = 1
const ROY_ST_APYUSD = '0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c'
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const MARKET_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'

function reviewedRoyaltyMarket(overrides: Parameters<typeof getMarketRisk>[0] = {}) {
  return getMarketRisk({
    chainId: MAINNET_CHAIN_ID,
    uniqueKey: MARKET_ID,
    loanAssetAddress: USDC,
    collateralAssetAddress: ROY_ST_APYUSD,
    loanAssetSymbol: 'USDC',
    collateralAssetSymbol: 'ROY-ST-apyUSD',
    ...overrides,
  })
}

describe('collateral review risk allowlist', () => {
  test('keeps ROY-ST-apyUSD unknown without a collateral review signal', () => {
    expect(reviewedRoyaltyMarket()).toEqual({
      status: 'yellow',
      reasonCodes: ['unknown_collateral'],
    })
  })

  test('treats the reviewed mainnet ROY-ST-apyUSD collateral as whitelisted', () => {
    expect(reviewedRoyaltyMarket({ hasCollateralReview: true })).toEqual({
      status: 'white',
      reasonCodes: ['collateral_review'],
    })
  })

  test('does not let a collateral review override stronger black risk signals', () => {
    expect(reviewedRoyaltyMarket({
      hasCollateralReview: true,
      warnings: [{ type: 'incorrect_oracle_configuration' }],
    })).toEqual({
      status: 'black',
      reasonCodes: ['oracle_misconfigured'],
    })
  })
})
