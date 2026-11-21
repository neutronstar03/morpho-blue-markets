import { afterEach, describe, expect, test } from 'bun:test'
import { getMarketRisk } from '../app/lib/market-risk/market-risk'
import { replaceSharedDecisions } from '../app/lib/reviews/shared-decisions'

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

  test('does not grant approval from a descriptive review signal', () => {
    expect(reviewedRoyaltyMarket({ hasCollateralReview: true }).status).toBe('yellow')
  })

  test('uses explicit positive review decisions', () => {
    replaceSharedDecisions([{ chainId: 1, collateralAddress: ROY_ST_APYUSD, decision: 'whitelist', reason: 'Verified exit', reviewPath: `v1/chain/1/${ROY_ST_APYUSD}.json` }])
    expect(reviewedRoyaltyMarket({ hasCollateralReview: true })).toEqual({
      status: 'white',
      reasonCodes: ['collateral_review'],
      reason: 'Verified exit',
    })
  })

  test('excludes the Ethereum stUSDS contract even if a whitelist suggests approval', () => {
    const collateralAddress = '0x99cd4ec3f88a45940936f469e4bb72a2a701eeb9'
    replaceSharedDecisions([{ chainId: 1, collateralAddress, decision: 'whitelist', reason: 'Earlier approval', reviewPath: `v1/chain/1/${collateralAddress}.json` }])
    const market = {
      uniqueKey: '0xd570c19c0dc0fbe4ab7faf4a37c4150e1c141c8aada8ca3e1b4b6c1b712af93d',
      loanAssetAddress: USDC,
      collateralAssetAddress: collateralAddress,
      collateralAssetSymbol: 'stUSDS',
    }

    expect(getMarketRisk({ ...market, chainId: 1 })).toMatchObject({ status: 'black', reason: expect.stringContaining('Redemption') })
    expect(getMarketRisk({ ...market, chainId: 8453 }).status).toBe('yellow')
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

afterEach(() => replaceSharedDecisions([]))
