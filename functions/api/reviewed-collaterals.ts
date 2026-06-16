import { parseReviewedCollateralTree } from '../../app/lib/reviews/reviewed-collaterals'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 5 * 60
const REVIEW_REPO_TREE_URL = 'https://api.github.com/repos/neutronstar03/morpho-collateral-reviews/git/trees/main?recursive=1'

interface Env {}

function parseOptionalChainId(value: string | null) {
  if (value == null || value.trim() === '')
    return undefined

  const chainId = Number(value)
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null
}

async function fetchReviewTree() {
  const res = await fetch(REVIEW_REPO_TREE_URL, {
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
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const tree = await fetchReviewTree()
      const data = parseReviewedCollateralTree(tree, chainId)
      return { data }
    },
  })
}
