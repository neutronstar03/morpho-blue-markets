import type { ReviewedCollateralListItem } from '~/lib/reviews/types'
import { useQuery } from '@tanstack/react-query'
import {
  parseReviewedCollateralsApiResponse,
  parseReviewedCollateralTree,
  reviewedCollateralListToKeySet,
} from '~/lib/reviews/reviewed-collaterals'

const REVIEW_REPO_TREE_URL = 'https://api.github.com/repos/neutronstar03/morpho-collateral-reviews/git/trees/main?recursive=1'
const REVIEWED_COLLATERALS_STALE_TIME_MS = 5 * 60 * 1000

async function fetchDirectReviewedCollaterals(chainId?: number): Promise<ReviewedCollateralListItem[]> {
  const res = await fetch(REVIEW_REPO_TREE_URL, {
    headers: {
      'accept': 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!res.ok)
    throw new Error(`Reviewed collaterals direct fetch failed: ${res.status}`)

  return parseReviewedCollateralTree(await res.json(), chainId)
}

export async function fetchReviewedCollaterals(chainId?: number): Promise<ReviewedCollateralListItem[]> {
  const params = new URLSearchParams()
  if (chainId)
    params.set('chainId', String(chainId))

  const path = `/api/reviewed-collaterals${params.size > 0 ? `?${params}` : ''}`

  try {
    const res = await fetch(path)
    if (res.ok)
      return parseReviewedCollateralsApiResponse(await res.json())

    if (!import.meta.env.DEV)
      throw new Error(`Reviewed collaterals fetch failed: ${res.status}`)
  }
  catch (error) {
    if (!import.meta.env.DEV)
      throw error
  }

  return fetchDirectReviewedCollaterals(chainId)
}

export function useReviewedCollateralKeySet(args: {
  chainId?: number
  enabled?: boolean
} = {}) {
  const { chainId, enabled = true } = args
  return useQuery({
    queryKey: ['reviewed-collaterals', chainId ?? 'all'],
    queryFn: () => fetchReviewedCollaterals(chainId),
    enabled,
    staleTime: REVIEWED_COLLATERALS_STALE_TIME_MS,
    retry: 1,
    select: reviewedCollateralListToKeySet,
  })
}
