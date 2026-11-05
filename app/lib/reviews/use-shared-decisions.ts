import { useQuery } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { getSharedDecisionsVersion, parseSharedDecisions, replaceSharedDecisions, SHARED_DECISIONS_URL, subscribeSharedDecisions } from './shared-decisions'

export function useSharedDecisionsVersion() {
  return useSyncExternalStore(subscribeSharedDecisions, getSharedDecisionsVersion, () => 0)
}

export function useSharedDecisionsPreload() {
  const query = useQuery({
    queryKey: ['shared-collateral-decisions-v1'],
    queryFn: async ({ signal }) => {
      const response = await fetch(SHARED_DECISIONS_URL, { signal })
      if (!response.ok)
        throw new Error(`Collateral decisions fetch failed: ${response.status}`)
      return parseSharedDecisions(await response.json())
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })
  useEffect(() => {
    // Retain previous effective decisions on a transport/contract failure.
    if (query.data)
      replaceSharedDecisions(query.data)
  }, [query.data])
  return query
}
