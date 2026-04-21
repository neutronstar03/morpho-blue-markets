import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 30 * 60
const NEGATIVE_CACHE_TTL_SECONDS = 3 * 60
const REVIEW_REPO_BASE_URL = 'https://raw.githubusercontent.com/neutronstar03/morpho-collateral-reviews/main/v1/chain'

interface Env {}

interface ReviewSource {
  label: string
  url: string
}

interface ReviewPayload {
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
  sources?: ReviewSource[]
}

function normalizeAddress(value?: string | null) {
  const s = (value ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeSources(value: unknown): ReviewSource[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object')
      return []
    const src = item as Partial<ReviewSource>
    const label = normalizeString(src.label)
    const url = normalizeString(src.url)
    if (!label || !url)
      return []
    return [{ label, url }]
  })
}

function normalizeReview(raw: unknown, chainId: number, collateralAddress: string) {
  if (!raw || typeof raw !== 'object')
    return null

  const review = raw as ReviewPayload
  const rawChainId = Number(review.chainId)
  const rawAddress = normalizeAddress(review.collateralAddress)
  const rank = review.rank == null ? null : Number(review.rank)

  if (!Number.isFinite(rawChainId) || rawChainId !== chainId)
    return null
  if (!rawAddress || rawAddress !== collateralAddress)
    return null

  return {
    version: Number(review.version) || 1,
    chainId,
    collateralAddress,
    symbol: normalizeString(review.symbol),
    name: normalizeString(review.name),
    type: normalizeString(review.type),
    protocol: normalizeString(review.protocol),
    protocolUrl: normalizeString(review.protocolUrl),
    rank: rank != null && Number.isFinite(rank) && rank >= 1 && rank <= 5 ? Math.round(rank) : null,
    redeem: normalizeString(review.redeem),
    notes: normalizeString(review.notes),
    sources: normalizeSources(review.sources),
  }
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainIdRaw = url.searchParams.get('chainId')
  const address = normalizeAddress(url.searchParams.get('address'))

  const chainId = Number(chainIdRaw)

  if (!Number.isFinite(chainId) || chainId <= 0)
    return errorResponse('Missing or invalid chainId', 400)
  if (!address)
    return errorResponse('Missing or invalid address', 400)

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      const upstreamUrl = `${REVIEW_REPO_BASE_URL}/${chainId}/${address}.json`
      const res = await fetch(upstreamUrl, {
        headers: { accept: 'application/json' },
      })

      if (res.status === 404) {
        return {
          data: { found: false, profile: null },
          negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS,
        }
      }

      if (!res.ok)
        throw new Error(`Upstream error: ${res.status} ${res.statusText}`)

      const json = await res.json()
      const profile = normalizeReview(json, chainId, address)
      if (!profile) {
        return {
          data: { found: false, profile: null },
          negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS,
        }
      }

      return {
        data: { found: true, profile },
      }
    },
  })
}
