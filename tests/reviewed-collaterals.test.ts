import { describe, expect, test } from 'bun:test'
import {
  parseReviewedCollateralsApiResponse,
  reviewedCollateralListToKeySet,
} from '../app/lib/reviews/reviewed-collaterals'

const ROY_ST_APYUSD = '0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c'

describe('reviewed collateral list parsing', () => {
  test('accepts the direct compact API array shape', () => {
    const items = parseReviewedCollateralsApiResponse([[1, ROY_ST_APYUSD]])
    const keySet = reviewedCollateralListToKeySet(items)

    expect(keySet.has(`1:${ROY_ST_APYUSD}`)).toBe(true)
  })

  test('rejects envelope-shaped or malformed API responses', () => {
    expect(() => parseReviewedCollateralsApiResponse({ reviewedCollaterals: [[1, ROY_ST_APYUSD]] })).toThrow()
    expect(() => parseReviewedCollateralsApiResponse([[1, 'not-an-address']])).toThrow()
  })
})
