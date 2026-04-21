import { useQuery } from '@tanstack/react-query'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'

const REVIEW_REPO_BASE_URL = 'https://raw.githubusercontent.com/neutronstar03/morpho-collateral-reviews/main/v1/chain'

export interface CollateralReviewSource {
  label: string
  url: string
}

export interface CollateralReview {
  version: number
  chainId: number
  collateralAddress: string
  symbol?: string | null
  name?: string | null
  type?: string | null
  protocol?: string | null
  protocolUrl?: string | null
  rank?: number | null
  redeem?: string | null
  notes?: string | null
  sources: CollateralReviewSource[]
}

interface CollateralReviewApiResponse {
  found: boolean
  profile: CollateralReview | null
}

async function fetchDirectReview(chainId: number, collateralAddress: string) {
  const res = await fetch(`${REVIEW_REPO_BASE_URL}/${chainId}/${collateralAddress.toLowerCase()}.json`, {
    headers: { accept: 'application/json' },
  })

  if (res.status === 404)
    return null
  if (!res.ok)
    throw new Error(`Collateral review direct fetch failed: ${res.status}`)

  return await res.json() as CollateralReview
}

export function useCollateralReview(chainId?: number, collateralAddress?: string) {
  return useQuery<CollateralReview | null>({
    queryKey: ['collateral-review', chainId, collateralAddress?.toLowerCase()],
    queryFn: async () => {
      if (!chainId || !collateralAddress)
        return null

      const params = new URLSearchParams({
        chainId: String(chainId),
        address: collateralAddress.toLowerCase(),
      })

      try {
        const res = await fetch(`/api/collateral-review?${params}`)
        if (res.ok) {
          const data = await res.json() as CollateralReviewApiResponse
          return data.found ? data.profile : null
        }

        if (!import.meta.env.DEV)
          throw new Error(`Collateral review fetch failed: ${res.status}`)
      }
      catch (error) {
        if (!import.meta.env.DEV)
          throw error
      }

      return fetchDirectReview(chainId, collateralAddress)
    },
    enabled: !!chainId && !!collateralAddress,
    staleTime: STALE_TIME_MEDIUM_MS,
    retry: 1,
  })
}
