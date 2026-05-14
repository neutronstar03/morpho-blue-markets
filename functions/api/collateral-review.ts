import type { CollateralReview, CollateralReviewApiResponse, OracleReview, ReviewSource } from '../../app/lib/reviews/types'
import { edgeCacheProxy, errorResponse } from '../api/_cache-utils'

const CACHE_TTL_SECONDS = 30 * 60
const NEGATIVE_CACHE_TTL_SECONDS = 3 * 60
const REVIEW_REPO_BASE_URL = 'https://raw.githubusercontent.com/neutronstar03/morpho-collateral-reviews/main/v1/chain'

interface Env {}

interface ReviewPayload {
  version?: number | string | null
  chainId?: number | string | null
  collateralAddress?: string | null
  symbol?: string | null
  name?: string | null
  type?: string | null
  protocol?: string | null
  protocolUrl?: string | null
  rank?: number | string | null
  redeem?: string | null
  notes?: string | null
  sources?: unknown
}

interface OracleReviewPayload {
  version?: unknown
  chainId?: number | string | null
  oracleAddress?: string | null
  type?: string | null
  provider?: string | null
  rank?: number | string | null
  pricing?: string | null
  notes?: string | null
  sources?: unknown
}

function normalizeAddress(value?: string | null) {
  const s = (value ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeRequiredString(value: unknown) {
  const normalized = normalizeString(value)
  return normalized ?? null
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

function normalizeRequiredSources(value: unknown): ReviewSource[] | null {
  if (!Array.isArray(value))
    return null

  const sources: ReviewSource[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object')
      return null
    const src = item as Partial<ReviewSource>
    const label = normalizeRequiredString(src.label)
    const url = normalizeRequiredString(src.url)
    if (!label || !url)
      return null
    sources.push({ label, url })
  }
  return sources
}

function normalizeReview(raw: unknown, chainId: number, collateralAddress: string): CollateralReview | null {
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

function normalizeRank(value: unknown) {
  if (value == null)
    return null
  const rank = Number(value)
  return Number.isFinite(rank) && rank >= 1 && rank <= 5 ? Math.round(rank) : null
}

function normalizeOracleReview(raw: unknown, chainId: number, oracleAddress: string): OracleReview | null {
  if (!raw || typeof raw !== 'object')
    return null

  const review = raw as OracleReviewPayload
  const version = normalizeString(review.version)
  const rawChainId = Number(review.chainId)
  const rawAddress = normalizeAddress(review.oracleAddress)
  const type = normalizeRequiredString(review.type)
  const provider = normalizeRequiredString(review.provider)
  const rank = normalizeRank(review.rank)
  const pricing = normalizeRequiredString(review.pricing)
  const notes = normalizeRequiredString(review.notes)
  const sources = normalizeRequiredSources(review.sources)

  if (version !== '1.1')
    return null
  if (!Number.isFinite(rawChainId) || rawChainId !== chainId)
    return null
  if (!rawAddress || rawAddress !== oracleAddress)
    return null
  if (!type || !provider || rank == null || !pricing || !notes || !sources)
    return null

  return {
    version,
    chainId,
    oracleAddress,
    type,
    provider,
    rank,
    pricing,
    notes,
    sources,
  }
}

async function fetchReviewJson(path: string) {
  const res = await fetch(`${REVIEW_REPO_BASE_URL}/${path}`, {
    headers: { accept: 'application/json' },
  })

  if (res.status === 404)
    return null
  if (!res.ok)
    throw new Error(`Upstream error: ${res.status} ${res.statusText}`)

  return await res.json()
}

async function fetchOptionalOracleReview(chainId: number, oracleAddress: string) {
  try {
    const json = await fetchReviewJson(`${chainId}/oracle/${oracleAddress}.json`)
    return normalizeOracleReview(json, chainId, oracleAddress)
  }
  catch {
    return null
  }
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)
  const chainIdRaw = url.searchParams.get('chainId')
  const address = normalizeAddress(url.searchParams.get('address'))
  const oracleAddress = normalizeAddress(url.searchParams.get('oracleAddress'))

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
      const [collateralJson, oracleJson] = await Promise.all([
        fetchReviewJson(`${chainId}/${address}.json`),
        oracleAddress ? fetchOptionalOracleReview(chainId, oracleAddress) : Promise.resolve(null),
      ])

      const profile = normalizeReview(collateralJson, chainId, address)
      const oracleReview = oracleJson
      if (!profile) {
        const data: CollateralReviewApiResponse = { found: false, profile: null, collateralReview: null, oracleReview }
        return {
          data,
          negativeTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS,
        }
      }

      const data: CollateralReviewApiResponse = { found: true, profile, collateralReview: profile, oracleReview }
      return {
        data,
      }
    },
  })
}
