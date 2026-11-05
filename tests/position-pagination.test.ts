import { describe, expect, test } from 'bun:test'
import { collectPositionPages, parsePositionPage, validatePositionIdentity } from '../app/lib/graphql/position-pages'

function page(items: number[], first: number, skip: number, total: number) {
  return { marketPositions: { items, pageInfo: { countTotal: total, count: items.length, limit: first, skip } } }
}

describe('complete position pagination', () => {
  for (const total of [0, 99, 100, 101, 500, 501]) {
    test(`discovers ${total} positions before local filtering`, async () => {
      const all = Array.from({ length: total }, (_, i) => i)
      const requests: number[] = []
      const result = await collectPositionPages({
        pageSize: total >= 500 ? 500 : 100,
        fetchPage: async (first, skip) => {
          requests.push(skip)
          return page(all.slice(skip, skip + first), first, skip, total)
        },
        parseItem: item => item as number,
        key: String,
      })
      expect(result).toEqual(all)
      expect(requests.length).toBe(Math.max(1, Math.ceil(total / (total >= 500 ? 500 : 100))))
      expect(result.filter(i => i >= 100)).toEqual(all.filter(i => i >= 100))
    })
  }
  test('deduplicates after raw pagination and never stops on filtered full pages', async () => {
    const result = await collectPositionPages({ pageSize: 2, fetchPage: async (first, skip) => page(skip ? [1, 2] : [0, 1], first, skip, 4), parseItem: item => item as number, key: String })
    expect(result).toEqual([0, 1, 2])
    expect(result.filter(i => i > 1)).toEqual([2])
  })
  test('rejects a failed later page rather than returning partial positions', async () => {
    await expect(collectPositionPages({ pageSize: 1, fetchPage: async (first, skip) => {
      if (skip)
        throw new Error('page two failed')
      return page([1], first, skip, 2)
    }, parseItem: Number, key: String })).rejects.toThrow('page two failed')
  })
  test('cancels obsolete pagination between pages', async () => {
    const controller = new AbortController()
    await expect(collectPositionPages({ pageSize: 1, signal: controller.signal, fetchPage: async (first, skip) => {
      controller.abort()
      return page([1], first, skip, 2)
    }, parseItem: Number, key: String })).rejects.toThrow()
  })
  test('rejects malformed pagination and critical quantities', () => {
    expect(() => parsePositionPage({ marketPositions: { items: [] } }, 100, 0)).toThrow()
    expect(() => parsePositionPage(page([1], 100, 1, 1), 100, 0)).toThrow()
    expect(() => validatePositionIdentity({ market: {}, state: { supplyShares: 'NaN' } }, true)).toThrow()
  })
})
