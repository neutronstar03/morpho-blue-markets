import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { onRequestGet } from '../../functions/api/token-liquidity'

afterEach(() => mock.restore())
function context() {
  return { request: new Request(`https://example.test/api/token-liquidity?chainId=1&address=0x${'1'.repeat(40)}`), waitUntil: () => {} } as unknown as EventContext<Record<string, never>>
}
test('upstream liquidity transport failure is an error, not a cached missing-liquidity result', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(new Response('{}', { status: 503 }))
  const response = await onRequestGet(context())
  expect(response.status).toBe(502)
  expect(await response.json()).toHaveProperty('error')
})
test('explicit missing token remains an intentional nullable resource', async () => {
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }))
  const response = await onRequestGet(context())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ liquidityUsd: null })
})
