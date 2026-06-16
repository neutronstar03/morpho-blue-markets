import type { ReviewedCollateralListItem } from './types'

interface GitTreeEntryPayload {
  path?: unknown
  type?: unknown
}

interface GitTreePayload {
  tree?: unknown
  truncated?: unknown
}

const REVIEWED_COLLATERAL_PATH_RE = /^v1\/chain\/(\d+)\/(0x[a-fA-F0-9]{40})\.json$/

export function reviewedCollateralKey(chainId: number, collateralAddress: string) {
  return `${chainId}:${collateralAddress.toLowerCase()}`
}

export function normalizeReviewedCollateralAddress(value: unknown) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function parseReviewedCollateralItem(value: unknown): ReviewedCollateralListItem | null {
  if (!Array.isArray(value) || value.length !== 2)
    return null

  const chainId = Number(value[0])
  const collateralAddress = normalizeReviewedCollateralAddress(value[1])
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !collateralAddress)
    return null

  return [chainId, collateralAddress]
}

export function parseReviewedCollateralsApiResponse(raw: unknown): ReviewedCollateralListItem[] {
  if (!Array.isArray(raw))
    throw new Error('Invalid reviewed collaterals response')

  const reviewedCollaterals: ReviewedCollateralListItem[] = []
  for (const item of raw) {
    const parsed = parseReviewedCollateralItem(item)
    if (!parsed)
      throw new Error('Invalid reviewed collateral entry')
    reviewedCollaterals.push(parsed)
  }

  return reviewedCollaterals
}

export function parseReviewedCollateralTree(raw: unknown, chainIdFilter?: number): ReviewedCollateralListItem[] {
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid Git tree response')

  const payload = raw as GitTreePayload
  if (payload.truncated === true)
    throw new Error('Git tree response was truncated')
  if (!Array.isArray(payload.tree))
    throw new Error('Invalid Git tree entries')

  const seen = new Set<string>()
  const reviewedCollaterals: ReviewedCollateralListItem[] = []

  for (const item of payload.tree) {
    if (!item || typeof item !== 'object')
      continue

    const entry = item as GitTreeEntryPayload
    if (entry.type !== 'blob' || typeof entry.path !== 'string')
      continue

    const match = REVIEWED_COLLATERAL_PATH_RE.exec(entry.path)
    if (!match)
      continue

    const chainId = Number(match[1])
    const collateralAddress = normalizeReviewedCollateralAddress(match[2])
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !collateralAddress)
      continue
    if (chainIdFilter != null && chainId !== chainIdFilter)
      continue

    const key = reviewedCollateralKey(chainId, collateralAddress)
    if (seen.has(key))
      continue
    seen.add(key)
    reviewedCollaterals.push([chainId, collateralAddress])
  }

  return reviewedCollaterals.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
}

export function reviewedCollateralListToKeySet(items: ReviewedCollateralListItem[]) {
  return new Set(items.map(([chainId, collateralAddress]) => reviewedCollateralKey(chainId, collateralAddress)))
}
