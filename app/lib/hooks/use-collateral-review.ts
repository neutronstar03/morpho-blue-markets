import type { CollateralReview, CollateralReviewApiResponse, MarketReviewBundle } from '~/lib/reviews/types'
import { useQuery } from '@tanstack/react-query'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'

const REVIEW_REPO_BASE_URL = 'https://raw.githubusercontent.com/neutronstar03/morpho-collateral-reviews/main/v1/chain'

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

export function useCollateralReview(chainId?: number, collateralAddress?: string, oracleAddress?: string) {
  return useQuery<MarketReviewBundle | null>({
    queryKey: ['collateral-review', chainId, collateralAddress?.toLowerCase(), oracleAddress?.toLowerCase()],
    queryFn: async () => {
      if (!chainId || !collateralAddress)
        return null

      const params = new URLSearchParams({
        chainId: String(chainId),
        address: collateralAddress.toLowerCase(),
      })
      if (oracleAddress)
        params.set('oracleAddress', oracleAddress.toLowerCase())

      try {
        const res = await fetch(`/api/collateral-review?${params}`)
        if (res.ok) {
          const data = await res.json() as CollateralReviewApiResponse
          if (data.collateralReview || data.oracleReview) {
            return {
              collateralReview: data.collateralReview,
              oracleReview: data.oracleReview,
            }
          }

          return null
        }

        if (!import.meta.env.DEV)
          throw new Error(`Collateral review fetch failed: ${res.status}`)
      }
      catch (error) {
        if (!import.meta.env.DEV)
          throw error
      }

      const collateralReview = await fetchDirectReview(chainId, collateralAddress)
      return collateralReview ? { collateralReview, oracleReview: null } : null
    },
    enabled: !!chainId && !!collateralAddress,
    staleTime: STALE_TIME_MEDIUM_MS,
    retry: 1,
  })
}
