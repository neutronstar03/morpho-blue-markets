import { afterEach, describe, expect, test } from 'bun:test'
import { getMarketRisk } from '../app/lib/market-risk/market-risk'
import { collateralReviewRequest } from '../app/lib/reviews/request-review'
import { parseSharedDecisions, replaceSharedDecisions } from '../app/lib/reviews/shared-decisions'

const address = '0xbd373c9d3d8976a4fecc504a93c768bbe8c3227c'
const entry = { chainId: 1, collateralAddress: address, decision: 'whitelist' as const, reason: 'Evidence with verified exit', reviewPath: `v1/chain/1/${address}.json` }
const market = { chainId: 1, uniqueKey: `0x${'1'.repeat(64)}`, collateralAssetAddress: address }
afterEach(() => replaceSharedDecisions([]))

describe('shared binary collateral decisions', () => {
  test('only explicit classified canonical collateral evidence can enter the index', () => {
    expect(parseSharedDecisions({ version: 1, decisions: [entry] })).toEqual([entry])
    for (const changes of [{ decision: 'unknown' }, { reason: '' }, { chainId: 2 }, { reviewPath: `v1/chain/1/oracle/${address}.json` }, { collateralAddress: address.toUpperCase() }]) {
      expect(() => parseSharedDecisions({ version: 1, decisions: [{ ...entry, ...changes }] })).toThrow()
    }
  })

  test('rejects conflicting persisted decisions and is idempotent for exact repeats', () => {
    expect(parseSharedDecisions({ version: 1, decisions: [entry, entry] })).toEqual([entry])
    expect(() => parseSharedDecisions({ version: 1, decisions: [entry, { ...entry, decision: 'blacklist' }] })).toThrow()
    expect(() => parseSharedDecisions({ tree: [{ path: entry.reviewPath }] })).toThrow()
  })

  test('positive and negative outcomes retain reasons independently of rank metadata', () => {
    for (const decision of ['whitelist', 'blacklist']) {
      const parsed = parseSharedDecisions({ version: 1, decisions: [{ ...entry, decision, rank: null }] })
      replaceSharedDecisions(parsed)
      const risk = getMarketRisk(market)
      expect(risk.status).toBe(decision === 'whitelist' ? 'white' : 'black')
      expect(risk.reason).toBe(entry.reason)
    }
  })

  test('stronger exclusions survive positive review updates', () => {
    replaceSharedDecisions(parseSharedDecisions({ version: 1, decisions: [entry] }))
    expect(getMarketRisk({ ...market, warnings: [{ type: 'incorrect_oracle_configuration' }] }).status).toBe('black')
    const blocked = '0x1202f5c7b4b9e47a1a484e8b270be34dbbc75055'
    replaceSharedDecisions(parseSharedDecisions({ version: 1, decisions: [{ ...entry, collateralAddress: blocked, reviewPath: `v1/chain/1/${blocked}.json` }] }))
    expect(getMarketRisk({ ...market, collateralAssetAddress: blocked }).status).toBe('black')
  })

  test('request links preserve exact identity and include deduplication and completion contract', () => {
    const urls = collateralReviewRequest(1, address.toUpperCase(), market.uniqueKey)
    const body = new URL(urls.create).searchParams.get('body')!
    expect(body).toContain(`Deduplication key: 1:${address}`)
    expect(body).toContain(entry.reviewPath)
    expect(body).toContain('blacklist with reason')
    expect(new URL(urls.existing).searchParams.get('q')).toContain(address)
  })
})
