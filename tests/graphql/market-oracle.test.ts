import { readFileSync } from 'node:fs'
// Guard the upstream oracle selection and the normalized address used by market safety checks.
import { describe, expect, test } from 'bun:test'
import { parse, visit } from 'graphql'
import { normalizeMarketOracle, normalizeMarketOracles } from '../../app/lib/graphql/market-oracle'
import { QUERY_SINGLE_MORPHO_MARKET } from '../../app/lib/graphql/queries/market-detail'
import { QUERY_MARKETS_BY_CHAIN } from '../../app/lib/graphql/queries/markets-by-chain'

const ORACLE = '0x1234567890123456789012345678901234567890'

// Read the production operation without importing its React/blacklist hook graph.
const listSource = readFileSync(new URL('../../app/lib/hooks/graphql/use-list-markets.ts', import.meta.url), 'utf8')
const listQuery = listSource.match(/export const QUERY_LIST_MARKETS = gql`([\s\S]*?)`/)?.[1]
if (!listQuery)
  throw new Error('Market-list query not found')

describe('Morpho oracle API compatibility', () => {
  for (const [name, query] of [
    ['market list', listQuery],
    ['market detail', QUERY_SINGLE_MORPHO_MARKET],
    ['optimizer discovery', QUERY_MARKETS_BY_CHAIN],
  ]) {
    test(`${name} selects oracle.address, not the removed Market.oracleAddress`, () => {
      let oracleSelections = 0
      visit(parse(query), {
        Field(node) {
          expect(node.name.value).not.toBe('oracleAddress')
          expect(node.name.value).not.toBe('priceUsd')
          if (node.name.value === 'oracle') {
            oracleSelections++
            expect(node.selectionSet?.selections).toEqual([
              expect.objectContaining({ kind: 'Field', name: expect.objectContaining({ value: 'address' }) }),
            ])
          }
        },
      })
      expect(oracleSelections).toBe(1)
    })
  }

  test('preserves market data and exposes the original oracleAddress contract', () => {
    const market = { uniqueKey: 'market', state: { supplyAssets: '123' }, oracle: { address: ORACLE } }
    expect(normalizeMarketOracle(market)).toEqual({
      uniqueKey: 'market',
      state: { supplyAssets: '123' },
      oracleAddress: ORACLE,
    })
    expect(market.oracle).toEqual({ address: ORACLE })
  })

  test('drops unavailable oracle metadata without discarding healthy markets', () => {
    expect(normalizeMarketOracles([{ uniqueKey: 'missing', oracle: null }, { uniqueKey: 'valid', oracle: { address: ORACLE } }]))
      .toEqual([{ uniqueKey: 'valid', oracleAddress: ORACLE }])
    expect(() => normalizeMarketOracles([{ oracle: undefined }])).toThrow('missing a valid oracle address')
  })

  test('preserves an explicitly supplied zero oracle address without inventing one', () => {
    const address = `0x${'0'.repeat(40)}`
    expect(normalizeMarketOracle({ oracle: { address } }).oracleAddress).toBe(address)
  })

  for (const oracle of [null, undefined, {}, { address: null }, { address: 42 }, { address: '0x1234' }, { address: `0x${'g'.repeat(40)}` }]) {
    test(`rejects unavailable or malformed oracle metadata: ${JSON.stringify(oracle)}`, () => {
      expect(() => normalizeMarketOracle({ oracle })).toThrow('missing a valid oracle address')
    })
  }
})
