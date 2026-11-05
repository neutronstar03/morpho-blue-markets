import { describe, expect, test } from 'bun:test'
import { ApiContractError, normalizeUnsignedInteger, parseMarketDetailResponse, parseMarketListResponse, parseOptimizerMarketPage, UnavailableMarketMetadataError } from '../../app/lib/graphql/market-responses'
import { parseVaultV2ChainPositionsResponse, parseVaultV2PositionsResponse } from '../../app/lib/graphql/vault-position-responses'

function market() {
  const state: Record<string, unknown> = Object.fromEntries([
    'borrowApy',
    'utilization',
    'dailyPriceVariation',
    'netSupplyApy',
    'avgNetSupplyApy',
    'dailyNetSupplyApy',
    'weeklyNetSupplyApy',
    'netBorrowApy',
    'avgNetBorrowApy',
    'dailyNetBorrowApy',
    'weeklyNetBorrowApy',
    'supplyApy',
    'avgSupplyApy',
    'dailySupplyApy',
    'weeklySupplyApy',
    'apyAtTarget',
  ].map(key => [key, 0.1]))
  Object.assign(state, { supplyAssets: 1000, supplyShares: '9007199254740993000', borrowAssets: 500, supplyAssetsUsd: 1000, borrowAssetsUsd: 500, collateralAssets: null, collateralAssetsUsd: null, rateAtTarget: '123456789', rewards: [] })
  return {
    marketId: `0x${'a'.repeat(64)}`,
    uniqueKey: `0x${'a'.repeat(64)}`,
    irmAddress: `0x${'b'.repeat(40)}`,
    oracle: { address: `0x${'c'.repeat(40)}` },
    lltv: '800000000000000000',
    morphoBlue: { chain: { id: 1 } },
    listed: true,
    creationTimestamp: 1700000000,
    loanAsset: { address: `0x${'d'.repeat(40)}`, symbol: 'TEST', name: 'Test asset', decimals: 6, price: null, chain: { id: 1, network: 'ethereum' } },
    collateralAsset: { address: `0x${'e'.repeat(40)}`, symbol: 'COL', name: 'Collateral', decimals: 18, price: null },
    supplyingVaults: [],
    supplyingVaultV2s: [],
    warnings: [],
    badDebt: { usd: 0 },
    realizedBadDebt: { usd: 0 },
    state,
  }
}

describe('critical market response boundaries', () => {
  test('normalizes safe numeric BigInt and preserves large strings exactly', () => {
    const result = parseMarketListResponse({ markets: { items: [market()] } })
    expect(result.markets.items[0].state.supplyAssets).toBe('1000')
    expect(result.markets.items[0].creationTimestamp).toBe('1700000000')
    expect(parseOptimizerMarketPage({ markets: { items: [market()] } }, 1).items[0].state.supplyShares).toBe('9007199254740993000')
    expect(() => normalizeUnsignedInteger(Number.MAX_SAFE_INTEGER + 1, 'shares')).toThrow()
  })
  test('rejects malformed envelopes instead of reporting empty markets', () => {
    for (const raw of [null, {}, { markets: null }, { markets: { items: null } }, { markets: { items: [{}] } }])
      expect(() => parseMarketListResponse(raw)).toThrow(ApiContractError)
  })
  test('rejects invalid addresses, decimal metadata, missing required objects, quantities and rates', () => {
    for (const mutate of [
      (value: ReturnType<typeof market>) => { value.loanAsset.address = 'not-an-address' },
      (value: ReturnType<typeof market>) => { value.loanAsset.decimals = 1.5 },
      (value: ReturnType<typeof market>) => { value.state.netSupplyApy = Number.NaN },
      (value: ReturnType<typeof market>) => { value.state.supplyAssets = -1 },
      (value: ReturnType<typeof market>) => { delete value.state.borrowAssets },
    ]) {
      const value = market()
      mutate(value)
      expect(() => parseMarketListResponse({ markets: { items: [value] } })).toThrow(ApiContractError)
    }
  })
  test('retains raw pagination length when intentional unavailable oracle resources are excluded', () => {
    const unavailable = { ...market(), oracle: null }
    const page = parseOptimizerMarketPage({ markets: { items: [unavailable, market()] } }, 1)
    expect(page.rawCount).toBe(2)
    expect(page.items).toHaveLength(1)
    expect(() => parseOptimizerMarketPage({ markets: { items: [market()] } }, 10)).toThrow('chain')
    expect(() => parseMarketDetailResponse({ marketById: unavailable })).toThrow(UnavailableMarketMetadataError)
  })
  test('distinguishes not-found detail from malformed detail and preserves unavailable prices', () => {
    expect(parseMarketDetailResponse({ marketById: null })).toBeNull()
    expect(() => parseMarketDetailResponse({})).toThrow(ApiContractError)
    expect(parseMarketDetailResponse({ marketById: market() })?.loanAsset.price).toBeNull()
  })
})

describe('Vault V2 discovery boundaries', () => {
  const vault = {
    shares: 1000,
    assets: '9007199254740993000',
    assetsUsd: null,
    vault: { address: `0x${'a'.repeat(40)}`, name: 'Vault', symbol: 'VLT', netApy: null, asset: { address: `0x${'b'.repeat(40)}`, symbol: 'ASSET', decimals: 18, price: null } },
  }
  test('normalizes identities/quantities and preserves unavailable monetary metadata', () => {
    const parsed = parseVaultV2PositionsResponse({ userByAddress: { vaultV2Positions: [vault] } })
    expect(parsed[0].shares).toBe('1000')
    expect(parsed[0].assets).toBe('9007199254740993000')
    expect(parsed[0].vault.netApy).toBeNull()
    expect(parsed[0].assetsUsd).toBeNull()
  })
  test('only explicit no-user/empty success is empty, never missing or malformed data', () => {
    expect(parseVaultV2ChainPositionsResponse({ userByAddress: null })).toEqual([])
    expect(parseVaultV2PositionsResponse({ userByAddress: { vaultV2Positions: [] } })).toEqual([])
    for (const raw of [{}, { userByAddress: {} }, { userByAddress: { vaultV2Positions: [{ ...vault, shares: null }] } }])
      expect(() => parseVaultV2PositionsResponse(raw)).toThrow(ApiContractError)
  })
})
