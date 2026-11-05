import { afterEach, expect, mock, spyOn, test } from 'bun:test'
import { graphqlClient } from '../../app/lib/graphql/client'
import { fetchSupplyVaults, parseVaultAprPage } from '../../app/lib/graphql/vault-aprs'
import { onRequestGet } from '../../functions/api/vault-aprs'

const vault = { address: `0x${'a'.repeat(40)}`, name: 'Vault', symbol: 'V', whitelisted: true, chain: { id: 1 }, asset: { address: `0x${'b'.repeat(40)}`, symbol: 'USDC', decimals: 6 }, avgNetApy: 0.1, totalAssetsUsd: 90_000, liquidityUsd: null }
afterEach(() => {
  mock.restore()
  delete (globalThis as any).caches
})
function ctx(params = '') {
  const writes: Promise<unknown>[] = []
  return { context: { request: new Request(`https://example.test/api/vault-aprs${params}`), waitUntil: (p: Promise<unknown>) => writes.push(p) } as unknown as EventContext<Record<string, never>>, writes }
}
function upstream() {
  return spyOn(graphqlClient, 'request').mockImplementation(async (options: any) => {
    const v1 = options.document.includes('query GetVaultsV1')
    return v1 ? { vaults: { items: [] } } : { vaultV2s: { items: [vault] } }
  })
}
test('normalizes intentional null metrics and rejects malformed identity/metrics', () => {
  const parse = (v: unknown) => parseVaultAprPage({ vaultV2s: { items: [v] } }, 'v2', [1])
  expect(parse({ ...vault, avgNetApy: null, totalAssetsUsd: null })[0]).toMatchObject({ avgNetApy: null, liquidityUsd: null })
  for (const bad of [{ ...vault, chain: { id: 10 } }, { ...vault, avgNetApy: undefined }, { ...vault, address: 'bad' }, { ...vault, liquidityUsd: Infinity }])
    expect(() => parse(bad)).toThrow()
  expect(() => parseVaultAprPage({}, 'v1', [1])).toThrow()
})
test('fetches later pages and does not publish partial data after a later failure', async () => {
  let failLater = false
  spyOn(graphqlClient, 'request').mockImplementation(async (options: any) => {
    if (options.document.includes('query GetVaultsV1'))
      return { vaults: { items: [] } }
    if (options.variables.skip === 200) {
      if (failLater)
        throw new Error('Page two failed')
      return { vaultV2s: { items: [{ ...vault, address: `0x${'c'.repeat(40)}` }] } }
    }
    return { vaultV2s: { items: Array.from({ length: 200 }, (_, i) => ({ ...vault, address: `0x${i.toString(16).padStart(40, '0')}` })) } }
  })
  expect(await fetchSupplyVaults([1])).toHaveLength(201)
  failLater = true
  await expect(fetchSupplyVaults([1])).rejects.toThrow('Page two failed')
})
test('cache miss populates a 120 second cache; hit avoids upstream; failure never caches', async () => {
  const store = new Map<string, Response>()
  const put = mock(async (key: Request, response: Response) => {
    store.set(key.url, response)
  })
  ;(globalThis as any).caches = { default: { match: async (key: Request) => store.get(key.url)?.clone(), put } }
  const source = upstream()
  const { context, writes } = ctx()
  const first = await onRequestGet(context)
  await Promise.all(writes)
  expect(first.status).toBe(200)
  expect(first.headers.get('cache-control')).toBe('public, max-age=120')
  expect((await first.json()).vaults).toHaveLength(1)
  expect(source).toHaveBeenCalledTimes(2)
  expect((await onRequestGet(context)).status).toBe(200)
  expect(source).toHaveBeenCalledTimes(2)
  store.clear()
  source.mockRejectedValue(new Error('Upstream unavailable'))
  expect((await onRequestGet(context)).status).toBe(502)
  expect(put).toHaveBeenCalledTimes(1)
  expect((await onRequestGet(ctx('?chainId=1').context)).status).toBe(400)
})
