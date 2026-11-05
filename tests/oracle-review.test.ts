import { describe, expect, test } from 'bun:test'
import { normalizeOracleReview } from '../functions/api/collateral-review'

const address = '0x9dbcd79e1f47d95de6f211bfb610f082fc584406'
const review = {
  version: '1.1' as const,
  chainId: 8453,
  oracleAddress: address,
  type: 'pyth',
  provider: 'Pyth',
  rank: 0,
  pricing: 'Historical Pyth route',
  notes: 'Historical warning; current freshness has not been revalidated.',
  sources: [{ label: 'Contract', url: `https://basescan.org/address/${address}` }],
}

describe('oracle review rank compatibility', () => {
  test('preserves severe rank zero and its dated caveat', () => {
    expect(normalizeOracleReview(review, 8453, address)).toEqual(review)
  })

  test('rejects unsupported and fractional ranks without upgrading them', () => {
    for (const rank of [-1, 6, 0.5, null, true, '0'])
      expect(normalizeOracleReview({ ...review, rank }, 8453, address)).toBeNull()
  })

  test('rejects wrong identity and resource version', () => {
    expect(normalizeOracleReview(review, 1, address)).toBeNull()
    expect(normalizeOracleReview({ ...review, version: 1 }, 8453, address)).toBeNull()
  })
})
