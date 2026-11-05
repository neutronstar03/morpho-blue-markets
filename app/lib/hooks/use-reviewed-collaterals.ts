import type { ReviewedCollateralListItem } from '~/lib/reviews/types'
import { useQuery } from '@tanstack/react-query'
import {
  parseReviewedCollateralsApiResponse,
  reviewedCollateralListToKeySet,
} from '~/lib/reviews/reviewed-collaterals'

import { parseSharedDecisions, SHARED_DECISIONS_URL } from '~/lib/reviews/shared-decisions'

const DECISION_MANIFEST_URL = SHARED_DECISIONS_URL
const REVIEWED_COLLATERALS_STALE_TIME_MS = 5 * 60 * 1000

async function fetchDirectReviewedCollaterals(chainId?: number): Promise<ReviewedCollateralListItem[]> {
  const res = await fetch(DECISION_MANIFEST_URL, {
    headers: {
      'accept': 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!res.ok)
    throw new Error(`Reviewed collaterals direct fetch failed: ${res.status}`)

  return parseSharedDecisions(await res.json())
    .filter(entry => entry.decision === 'whitelist' && (chainId == null || entry.chainId === chainId))
    .map(entry => [entry.chainId, entry.collateralAddress])
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
