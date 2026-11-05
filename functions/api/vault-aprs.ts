import type { VaultAprResponse } from '../../app/lib/graphql/vault-aprs'
import { CHAIN_CAPABILITIES } from '../../app/lib/chain-capabilities'
import { fetchSupplyVaults } from '../../app/lib/graphql/vault-aprs'
import { edgeCacheProxy, errorResponse } from './_cache-utils'

interface Env {}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  if ([...url.searchParams].length)
    return errorResponse('This endpoint accepts no query parameters', 400)
  return edgeCacheProxy({
    requestUrl: url.toString(),
    cacheTtlSeconds: 120,
    waitUntil: promise => context.waitUntil(promise),
    fetchUpstream: async () => {
      const data: VaultAprResponse = { vaults: await fetchSupplyVaults(CHAIN_CAPABILITIES.map(chain => chain.id), context.request.signal) }
      return { data }
    },
  })
}
