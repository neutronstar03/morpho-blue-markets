import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { resolveReviewRequest } from '../app/lib/reviews/request-review'

const address = '0x2f8bae126b8d416c009b82ccd60e4f9cabbd7702'
afterEach(() => mock.restore())

test('reuses an exact chain/address issue and ignores the same address on another chain', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    total_count: 2,
    items: [
      { html_url: 'https://github.com/neutronstar03/morpho-collateral-reviews/issues/1', body: `chainId: 10\ncollateralAddress: ${address}` },
      { html_url: 'https://github.com/neutronstar03/morpho-collateral-reviews/issues/2', body: `chainId: 1\ncollateralAddress: ${address}` },
    ],
  })))
  expect(await resolveReviewRequest(1, address, 'market')).toBe('https://github.com/neutronstar03/morpho-collateral-reviews/issues/2')
})

test('opens a prefilled issue only after complete successful lookup', async () => {
  const fetcher = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ total_count: 0, items: [] })))
  expect(await resolveReviewRequest(1, address, 'market')).toContain('/issues/new?')
  fetcher.mockResolvedValue(new Response(JSON.stringify({ total_count: 2, items: [] })))
  await expect(resolveReviewRequest(1, address, 'market')).rejects.toThrow('Incomplete')
})
