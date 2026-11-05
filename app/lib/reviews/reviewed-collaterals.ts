import type { ReviewedCollateralListItem } from './types'

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

export function reviewedCollateralListToKeySet(items: ReviewedCollateralListItem[]) {
  return new Set(items.map(([chainId, collateralAddress]) => reviewedCollateralKey(chainId, collateralAddress)))
}
