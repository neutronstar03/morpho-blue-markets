// Shared cache utilities for edge-cached API endpoints.
//
// Cloudflare Workers expose `caches.default` (Cache API) at runtime,
// but browser DOM types don't include it. We cast through `any` to
// avoid TS errors while keeping the runtime contract correct.

export interface CacheResult {
  response: Response
  fromCache: boolean
}

function getCloudflareCache(): Cache | undefined {
  return (globalThis as any).caches?.default as Cache | undefined
}

/**
 * Try to match a cached response from the Cloudflare Cache API.
 * Returns the cached Response if found, undefined otherwise.
 */
export async function getFromCache(url: string): Promise<Response | undefined> {
  const cfCache = getCloudflareCache()
  if (!cfCache)
    return undefined
  const cacheKey = new Request(url, { method: 'GET' })
  return cfCache.match(cacheKey)
}

/**
 * Store a response in the Cloudflare Cache API.
 * Uses waitUntil-friendly pattern: call this via context.waitUntil().
 */
export async function putInCache(url: string, response: Response): Promise<void> {
  const cfCache = getCloudflareCache()
  if (!cfCache)
    return
  const cacheKey = new Request(url, { method: 'GET' })
  await cfCache.put(cacheKey, response.clone())
}

/**
 * Create a JSON response with appropriate headers.
 * The `cacheMaxAge` parameter sets Cache-Control max-age (for CDN + browser caching).
 */
export function jsonResponse(data: unknown, cacheMaxAge: number): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheMaxAge}`,
    },
  })
}

/**
 * Create a JSON error response.
 */
export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Standard edge-cache handler pattern:
 * 1. Check cache → return if HIT
 * 2. Fetch upstream → return 502 if error
 * 3. Cache the response (fire-and-forget via waitUntil)
 * 4. Return the response
 *
 * The fetchUpstream function can return `{ data, negativeTtlSeconds? }`.
 * If `negativeTtlSeconds` is set, the response is cached with that shorter TTL
 * (for "no data found" results that should still be cached to avoid re-hammering).
 */
export async function edgeCacheProxy(options: {
  requestUrl: string
  waitUntil: (promise: Promise<unknown>) => void
  cacheTtlSeconds: number
  fetchUpstream: () => Promise<{ data: unknown, negativeTtlSeconds?: number }>
}): Promise<Response> {
  const { requestUrl, waitUntil, cacheTtlSeconds, fetchUpstream } = options

  // 1. Check edge cache
  const cached = await getFromCache(requestUrl)
  if (cached)
    return cached

  // 2. Fetch upstream
  let upstreamData: unknown
  let ttl: number
  try {
    const result = await fetchUpstream()
    upstreamData = result.data
    ttl = result.negativeTtlSeconds ?? cacheTtlSeconds
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Upstream error'
    return errorResponse(message, 502)
  }

  // 3. Build response and cache it
  const response = jsonResponse(upstreamData, ttl)
  waitUntil(putInCache(requestUrl, response.clone()))

  return response
}
