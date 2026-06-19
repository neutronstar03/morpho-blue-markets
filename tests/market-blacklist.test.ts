import { afterEach, describe, expect, test } from 'bun:test'
import { isMarketBlacklisted } from '../app/lib/market-blacklist'

const RealDate = globalThis.Date

function setSystemDate(isoDate: string) {
  const fixedTime = new RealDate(isoDate).getTime()
  globalThis.Date = class extends RealDate {
    constructor(value?: number | string) {
      if (value === undefined)
        super(fixedTime)
      else
        super(value)
    }

    static now() {
      return fixedTime
    }
  } as DateConstructor
}

function marketWithCollateralSymbol(collateralAssetSymbol: string) {
  return isMarketBlacklisted({
    chainId: 1,
    collateralAssetSymbol,
    loanAssetSymbol: 'USDC',
  })
}

afterEach(() => {
  globalThis.Date = RealDate
})

describe('market blacklist Pendle expiry detection', () => {
  test('blacklists expired Pendle PT symbols with one-digit days', () => {
    setSystemDate('2026-06-19T00:00:00.000Z')

    expect(marketWithCollateralSymbol('PT-srUSDe-2APR2026')).toBe(true)
  })

  test('keeps unexpired Pendle PT symbols with one-digit days', () => {
    setSystemDate('2026-03-01T00:00:00.000Z')

    expect(marketWithCollateralSymbol('PT-srUSDe-2APR2026')).toBe(false)
  })
})
