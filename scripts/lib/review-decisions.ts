import process from 'node:process'
import { fetchWithDeadline } from '../../app/lib/graphql/request-policy'
import { parseSharedDecisions, SHARED_DECISIONS_URL } from '../../app/lib/reviews/shared-decisions'

export async function loadReviewDecisions() {
  const localManifest = process.env.MBM_COLLATERAL_DECISION_MANIFEST
  if (localManifest)
    return parseSharedDecisions(await Bun.file(localManifest).json())
  const response = await fetchWithDeadline(SHARED_DECISIONS_URL)
  if (!response.ok)
    throw new Error(`Review decision source unavailable: HTTP ${response.status}`)
  return parseSharedDecisions(await response.json())
}
