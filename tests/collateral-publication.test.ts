import { describe, expect, test } from 'bun:test'
import { createCollateralPublicationPolicy } from '../app/lib/reviews/publication-policy'
import { parseSharedDecisions } from '../app/lib/reviews/shared-decisions'
import { parseCollateralCandidates } from '../scripts/lib/collateral-candidates'

const a = `0x${'a'.repeat(40)}`
const b = `0x${'b'.repeat(40)}`
const c = `0x${'c'.repeat(40)}`
function decision(address: string, outcome: string) {
  return { chainId: 1, collateralAddress: address, decision: outcome, reason: 'Evidence-based reason', reviewPath: `v1/chain/1/${address}.json` }
}

describe('authoritative classification publication', () => {
  test('adds explicit positives, removes negatives, preserves stronger exclusions and is repeatable', () => {
    const decisions = parseSharedDecisions({ version: 1, decisions: [decision(a, 'blacklist'), decision(b, 'whitelist'), decision(c, 'whitelist')] })
    const policy = createCollateralPublicationPolicy(decisions, { 1: [{ assetContract: b, comment: 'Existing exclusion' }] })
    const result = policy.applyWhitelist([{ chainId: 1, collateralAddress: a }])
    expect(result).toEqual([{ chainId: 1, collateralAddress: c }])
    expect(policy.applyWhitelist(result)).toEqual(result)
    expect(policy.isExcluded(1, a)).toBe(true)
    expect(policy.isExcluded(10, a)).toBe(false)
    expect(policy.isExcluded(1, b)).toBe(true)
    expect(policy.conflicts).toHaveLength(1)
  })
  test('preserves published legacy approvals without inventing new approvals from discovery', () => {
    const policy = createCollateralPublicationPolicy([], {})
    expect(policy.applyWhitelist([{ chainId: 1, collateralAddress: a }])).toEqual([{ chainId: 1, collateralAddress: a }])
    expect(policy.applyWhitelist([])).toEqual([])
  })
  test('rejects malformed seed input rather than silently treating it as an empty whitelist', () => {
    const policy = createCollateralPublicationPolicy([], {})
    for (const raw of [null, {}, [{}], [{ chainId: 1, collateralAddress: 'invalid' }]])
      expect(() => policy.applyWhitelist(raw)).toThrow()
  })
})

test('research discovery needs exact identity without requiring a ticker or price', () => {
  const item = { morphoBlue: { chain: { id: 1 } }, collateralAsset: { address: a } }
  expect(parseCollateralCandidates({ markets: { items: [item, { ...item, collateralAsset: null }] } }, 1))
    .toEqual({ addresses: [a], rawCount: 2 })
  expect(() => parseCollateralCandidates({ markets: { items: [item] } }, 10)).toThrow()
  expect(() => parseCollateralCandidates({ markets: { items: [{ ...item, collateralAsset: {} }] } }, 1)).toThrow()
})
