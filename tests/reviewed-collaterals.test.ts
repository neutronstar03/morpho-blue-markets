import { describe, expect, test } from 'bun:test'
import {
  parseReviewedCollateralsApiResponse,
  parseReviewedCollateralTree,
  reviewedCollateralListToKeySet,
} from '../app/lib/reviews/reviewed-collaterals'

const ROY_ST_APYUSD = '0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c'
const WSTUSR = '0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055'

describe('reviewed collateral list parsing', () => {
  test('extracts compact reviewed collateral tuples from Git tree paths', () => {
    const items = parseReviewedCollateralTree({
      truncated: false,
      tree: [
        { type: 'blob', path: 'v1/chain/1/0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c.json' },
        { type: 'blob', path: 'v1/chain/8453/0x1202F5C7B4B9E47A1A484E8B270BE34DBBC75055.json' },
        { type: 'blob', path: 'v1/chain/1/oracle/0x1111111111111111111111111111111111111111.json' },
        { type: 'tree', path: 'v1/chain/1' },
        { type: 'blob', path: 'README.md' },
      ],
    })

    expect(items).toEqual([
      [1, ROY_ST_APYUSD],
      [8453, WSTUSR],
    ])
  })

  test('filters reviewed collateral tuples by chain', () => {
    const items = parseReviewedCollateralTree({
      truncated: false,
      tree: [
        { type: 'blob', path: 'v1/chain/1/0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c.json' },
        { type: 'blob', path: 'v1/chain/8453/0x1202F5C7B4B9E47A1A484E8B270BE34DBBC75055.json' },
      ],
    }, 8453)

    expect(items).toEqual([[8453, WSTUSR]])
  })

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
