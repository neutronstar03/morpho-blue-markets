import { fetchWithDeadline } from '../../app/lib/graphql/request-policy'
import { parseSharedDecisions, SHARED_DECISIONS_URL } from '../../app/lib/reviews/shared-decisions'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 5 * 60
const DECISION_MANIFEST_URL = SHARED_DECISIONS_URL

interface Env {}

function parseOptionalChainId(value: string | null) {
  if (value == null || value.trim() === '')
    return undefined

  const chainId = Number(value)
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null
}

async function fetchDecisionManifest(signal?: AbortSignal) {
  const res = await fetchWithDeadline(DECISION_MANIFEST_URL, {
    signal,
    headers: {
      'accept': 'application/vnd.github+json',
      'user-agent': 'morpho-blue-markets',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!res.ok)
    throw new Error(`Upstream error: ${res.status} ${res.statusText}`)

  return await res.json()
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainId = parseOptionalChainId(url.searchParams.get('chainId'))

  if (chainId === null)
    return errorResponse('Invalid chainId', 400)

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: promise => context.waitUntil(promise),
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const tree = await fetchDecisionManifest(context.request.signal)
      const data = parseSharedDecisions(tree)
        .filter(entry => entry.decision === 'whitelist' && (chainId == null || entry.chainId === chainId))
        .map(entry => [entry.chainId, entry.collateralAddress])
      return { data }
    },
  })
}
