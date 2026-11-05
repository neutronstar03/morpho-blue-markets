import { expect, test } from 'bun:test'
import { parseLiquidationCount } from '../../app/lib/graphql/queries/market-liquidations'

test('keeps actual liquidation zero distinct from malformed/unavailable count', () => {
  expect(parseLiquidationCount({ transactions: { pageInfo: { countTotal: 0 } } })).toBe(0)
  expect(parseLiquidationCount({ transactions: { pageInfo: { countTotal: 7 } } })).toBe(7)
  for (const raw of [null, {}, { transactions: null }, { transactions: { pageInfo: null } }, { transactions: { pageInfo: { countTotal: -1 } } }, { transactions: { pageInfo: { countTotal: '7' } } }])
    expect(() => parseLiquidationCount(raw)).toThrow()
})
