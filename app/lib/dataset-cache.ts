import { useSyncExternalStore } from 'react'

// Shared browser-side lifecycle for generated risk datasets (blacklist,
// unhealthy markets, collateral whitelist, oracle providers).
//
// The lifecycle keeps a known-good payload alive across failed refreshes:
// a 404, HTML/JSON parse failure, or otherwise invalid payload falls through
// to the cache or the previously loaded in-memory data instead of silently
// replacing restrictions with an empty dataset. A valid empty payload still
// wins, because an empty artifact is meaningful.

export type DatasetSource = 'local' | 'remote' | 'cache' | 'none'
export type DatasetLifecycleStatus = 'uninitialized' | 'loading' | 'loaded' | 'failed'

// Freshness windows mirror the artifact publisher cadence
// (https://github.com/neutronstar03/mbm-artifacts workflows publish daily at
// 03:17 UTC and only when contents change). They intentionally differ per
// dataset so a stale whitelist stays distinguishable from a fresh approval.
export const COLLATERAL_WHITELIST_FRESHNESS_MS = 72 * 60 * 60 * 1000
export const MARKET_BLACKLIST_FRESHNESS_MS = 48 * 60 * 60 * 1000
export const UNHEALTHY_MARKETS_FRESHNESS_MS = 48 * 60 * 60 * 1000
export const ORACLE_PROVIDERS_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000

export const DATASET_FETCH_TIMEOUT_MS = 12_000
export const DATASET_RETRY_BASE_MS = 15_000
export const DATASET_RETRY_MAX_MS = 5 * 60 * 1000
const DATASET_EXPIRY_MIN_DELAY_MS = 60 * 1000
const DATASET_EXPIRY_MAX_DELAY_MS = 6 * 60 * 60 * 1000

export interface DatasetMeta {
  status: DatasetLifecycleStatus
  source: DatasetSource
  refreshing: boolean
  // Data acquisition time used for freshness. For a fetched payload this is the
  // successful check time; for a cached payload it is the cache write time.
  observedAtMs: number | null
  // Local cache write timestamp read back from storage (never relabelled).
  cachedAtMs: number | null
  // Optional payload publication time (e.g. artifact generatedAt). Informational:
  // it is *not* used as the freshness baseline.
  publishedAtMs: number | null
  lastCheckedAtMs: number | null
  freshnessMs: number
  nextRetryAtMs: number | null
  error: string | null
}

export interface DatasetDefinition<TPayload> {
  name: string
  cacheKey: string
  localPath: string
  remoteUrl: string
  freshnessMs: number
  // Old v1 caches stored generated entries under 'entries' (blacklist,
  // unhealthy, whitelist) or the full artifact under 'artifact' (oracle).
  payloadField?: 'entries' | 'artifact'
  // Returns the trusted payload, or null when the input is invalid. An empty
  // payload is a valid result; null means "do not replace known data".
  parse: (input: unknown) => TPayload | null
  getPublishedAtMs?: (input: unknown) => number | null
  timeoutMs?: number
  retryBaseMs?: number
  now?: () => number
  onChange?: () => void
}

export interface DatasetCache<TPayload> {
  ensureLoaded: () => void
  refresh: () => void
  getPayload: () => TPayload | null
  getMeta: () => DatasetMeta
  dispose: () => void
}

export interface DatasetMetaSource {
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
  getMeta: () => DatasetMeta
}

function isBrowser() {
  return typeof window !== 'undefined'
}

// Dev/static artifacts are only served from /public. An explicit global flag
// lets local previews and tests exercise that path without a Vite DEV build.
export function localArtifactsEnabled() {
  const override = (globalThis as { __MBM_LOCAL_ARTIFACTS__?: boolean }).__MBM_LOCAL_ARTIFACTS__
  if (typeof override === 'boolean')
    return override
  return Boolean((import.meta as any).env?.DEV)
}

export function baseUrlPrefix() {
  const base = (import.meta as any).env?.BASE_URL as string | undefined
  return base && typeof base === 'string' ? base : '/'
}

export function createDatasetCache<TPayload>(definition: DatasetDefinition<TPayload>): DatasetCache<TPayload> {
  const now = definition.now ?? (() => Date.now())
  const timeoutMs = definition.timeoutMs ?? DATASET_FETCH_TIMEOUT_MS
  const retryBaseMs = definition.retryBaseMs ?? DATASET_RETRY_BASE_MS
  const payloadField = definition.payloadField ?? 'entries'

  let status: DatasetLifecycleStatus = 'uninitialized'
  let source: DatasetSource = 'none'
  let refreshing = false
  let payload: TPayload | null = null
  let observedAtMs: number | null = null
  let cachedAtMs: number | null = null
  let publishedAtMs: number | null = null
  let lastCheckedAtMs: number | null = null
  let error: string | null = null
  let metaSnapshot: DatasetMeta | null = null
  let inFlight: Promise<void> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelayMs = retryBaseMs
  let nextRetryAtMs: number | null = null
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  let onlineTarget: Window | null = null
  let disposed = false
  const activeControllers = new Set<AbortController>()

  function buildMeta(): DatasetMeta {
    return {
      status,
      source,
      refreshing,
      observedAtMs,
      cachedAtMs,
      publishedAtMs,
      lastCheckedAtMs,
      freshnessMs: definition.freshnessMs,
      nextRetryAtMs,
      error,
    }
  }

  function getMeta() {
    if (!metaSnapshot)
      metaSnapshot = buildMeta()
    return metaSnapshot
  }

  function emit() {
    metaSnapshot = null
    definition.onChange?.()
  }

  function clearRetry() {
    if (retryTimer != null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    nextRetryAtMs = null
  }

  function clearExpiry() {
    if (expiryTimer != null) {
      clearTimeout(expiryTimer)
      expiryTimer = null
    }
  }

  function isStale() {
    if (observedAtMs === null)
      return true
    const age = now() - observedAtMs
    return age < 0 || age >= definition.freshnessMs
  }

  function readCache(): { payload: TPayload, cachedAtMs: number | null, publishedAtMs: number | null } | null {
    if (!isBrowser())
      return null
    try {
      const raw = window.localStorage.getItem(definition.cacheKey)
      if (!raw)
        return null
      const stored = JSON.parse(raw) as Record<string, unknown>
      const rawPayload = stored?.[payloadField]
      const parsed = definition.parse(rawPayload)
      if (parsed === null)
        return null
      const cachedAt = typeof stored?.cachedAtMs === 'number' && Number.isFinite(stored.cachedAtMs)
        && stored.cachedAtMs > 0 && stored.cachedAtMs <= now()
        ? stored.cachedAtMs
        : null
      return {
        payload: parsed,
        cachedAtMs: cachedAt,
        publishedAtMs: definition.getPublishedAtMs?.(rawPayload) ?? null,
      }
    }
    catch {
      return null
    }
  }

  function writeCache(rawPayload: unknown) {
    if (!isBrowser())
      return null
    try {
      const writtenAtMs = now()
      window.localStorage.setItem(definition.cacheKey, JSON.stringify({
        cachedAtMs: writtenAtMs,
        [payloadField]: rawPayload,
      }))
      return writtenAtMs
    }
    catch {
      // storage may be unavailable (private mode); in-memory data still works
      return null
    }
  }

  async function fetchJsonWithTimeout(url: string): Promise<{ ok: true, data: unknown } | { ok: false }> {
    const controller = new AbortController()
    activeControllers.add(controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      // Keep the abort timer active until the body has been consumed.
      return await readSuccessJson(response)
    }
    finally {
      clearTimeout(timer)
      activeControllers.delete(controller)
    }
  }

  async function readSuccessJson(res: Response): Promise<{ ok: true, data: unknown } | { ok: false }> {
    if (!res.ok)
      return { ok: false }
    const contentType = res.headers?.get?.('content-type') ?? ''
    if (contentType.includes('text/html'))
      return { ok: false }
    try {
      return { ok: true, data: await res.json() }
    }
    catch {
      return { ok: false }
    }
  }

  interface FetchResult {
    source: DatasetSource
    payload: TPayload
    raw: unknown
    publishedAtMs: number | null
  }

  async function attemptFetch(): Promise<FetchResult | null> {
    // Local static files are only relevant for dev/static workflows; a read
    // failure still falls through to the remote artifact.
    if (localArtifactsEnabled()) {
      try {
        const parsed = await fetchJsonWithTimeout(`${baseUrlPrefix()}${definition.localPath}`)
        if (parsed.ok) {
          const candidate = definition.parse(parsed.data)
          if (candidate !== null) {
            return {
              source: 'local',
              payload: candidate,
              raw: parsed.data,
              publishedAtMs: definition.getPublishedAtMs?.(parsed.data) ?? null,
            }
          }
        }
      }
      catch {
        // fall through to remote
      }
    }

    if (disposed)
      return null

    try {
      const parsed = await fetchJsonWithTimeout(definition.remoteUrl)
      if (parsed.ok) {
        const candidate = definition.parse(parsed.data)
        if (candidate !== null) {
          return {
            source: 'remote',
            payload: candidate,
            raw: parsed.data,
            publishedAtMs: definition.getPublishedAtMs?.(parsed.data) ?? null,
          }
        }
      }
    }
    catch {
      // unavailable
    }

    return null
  }

  function scheduleRetry() {
    if (!isBrowser() || disposed)
      return
    clearRetry()
    bindOnlineListener()
    const delay = retryDelayMs
    retryDelayMs = Math.min(retryDelayMs * 2, DATASET_RETRY_MAX_MS)
    nextRetryAtMs = now() + delay
    retryTimer = setTimeout(() => {
      retryTimer = null
      nextRetryAtMs = null
      void runRefresh()
    }, delay)
  }

  function scheduleExpiry() {
    if (!isBrowser() || disposed)
      return
    clearExpiry()
    if (observedAtMs === null)
      return
    const due = observedAtMs + definition.freshnessMs - now()
    const delay = Math.min(Math.max(due, DATASET_EXPIRY_MIN_DELAY_MS), DATASET_EXPIRY_MAX_DELAY_MS)
    expiryTimer = setTimeout(() => {
      expiryTimer = null
      if (isStale())
        void runRefresh()
      else
        scheduleExpiry()
    }, delay)
  }

  function onOnline() {
    if (status === 'failed' || error || isStale()) {
      retryDelayMs = retryBaseMs
      void runRefresh()
    }
  }

  function bindOnlineListener() {
    if (!isBrowser() || disposed || onlineTarget || typeof window.addEventListener !== 'function')
      return
    onlineTarget = window
    onlineTarget.addEventListener('online', onOnline)
  }

  function runRefresh(): Promise<void> {
    if (!isBrowser() || disposed)
      return Promise.resolve()
    if (inFlight)
      return inFlight

    clearRetry()
    clearExpiry()
    // Apply existing restrictions synchronously while the network revalidates.
    if (payload === null) {
      const cached = readCache()
      if (cached) {
        payload = cached.payload
        source = 'cache'
        observedAtMs = cached.cachedAtMs
        cachedAtMs = cached.cachedAtMs
        publishedAtMs = cached.publishedAtMs
        status = 'loaded'
      }
    }
    if (payload === null)
      status = 'loading'
    else
      refreshing = true
    inFlight = Promise.resolve().then(async () => {
      let result: FetchResult | null = null
      try {
        result = await attemptFetch()
      }
      catch {
        result = null
      }

      if (disposed)
        return

      if (result) {
        payload = result.payload
        source = result.source
        publishedAtMs = result.publishedAtMs
        observedAtMs = now()
        lastCheckedAtMs = observedAtMs
        error = null
        retryDelayMs = retryBaseMs
        cachedAtMs = writeCache(result.raw)
        status = 'loaded'
        refreshing = false
        emit()
        bindOnlineListener()
        scheduleExpiry()
        return
      }

      // Failure path: never silently clear known restrictions.
      const cached = payload === null ? readCache() : null
      if (payload !== null) {
        status = 'loaded'
        error = source === 'cache'
          ? 'Refresh failed; showing cached risk data'
          : 'Refresh failed; showing previously loaded risk data'
      }
      else if (cached) {
        payload = cached.payload
        source = 'cache'
        cachedAtMs = cached.cachedAtMs
        observedAtMs = cached.cachedAtMs
        publishedAtMs = cached.publishedAtMs
        status = 'loaded'
        error = 'Refresh failed; showing cached risk data'
      }
      else {
        status = 'failed'
        source = 'none'
        observedAtMs = null
        cachedAtMs = null
        publishedAtMs = null
        error = 'Risk data unavailable'
      }
      refreshing = false
      scheduleRetry()
      emit()
    }).finally(() => {
      inFlight = null
    })

    // Publish only after the in-flight guard exists, including synchronous
    // subscribers that call ensureLoaded again from their change callback.
    emit()

    return inFlight
  }

  function ensureLoaded() {
    if (!isBrowser() || disposed)
      return
    if (inFlight)
      return
    if (status === 'uninitialized') {
      void runRefresh()
      return
    }
    if (status === 'loading')
      return
    if (status === 'failed') {
      if (retryTimer != null)
        return
      void runRefresh()
      return
    }
    // loaded
    if (isStale()) {
      if (retryTimer === null)
        void runRefresh()
      return
    }
    scheduleExpiry()
  }

  function refresh() {
    if (!isBrowser())
      return
    retryDelayMs = retryBaseMs
    void runRefresh()
  }

  function dispose() {
    disposed = true
    clearRetry()
    clearExpiry()
    onlineTarget?.removeEventListener('online', onOnline)
    onlineTarget = null
    for (const controller of activeControllers)
      controller.abort()
  }

  return {
    ensureLoaded,
    refresh,
    getPayload: () => payload,
    getMeta,
    dispose,
  }
}

const serverMetaSnapshots = new WeakMap<DatasetMetaSource, DatasetMeta>()

function getServerMeta(source: DatasetMetaSource): DatasetMeta {
  let snapshot = serverMetaSnapshots.get(source)
  if (!snapshot) {
    snapshot = {
      status: 'uninitialized',
      source: 'none',
      refreshing: false,
      observedAtMs: null,
      cachedAtMs: null,
      publishedAtMs: null,
      lastCheckedAtMs: null,
      freshnessMs: source.getMeta().freshnessMs,
      nextRetryAtMs: null,
      error: null,
    }
    serverMetaSnapshots.set(source, snapshot)
  }
  return snapshot
}

export function useDatasetMeta(source: DatasetMetaSource): DatasetMeta {
  // Hydration must start with the prerendered empty state even if a loader
  // has already acquired browser-cached data before React mounts.
  return useSyncExternalStore(source.subscribe, source.getMeta, () => getServerMeta(source))
}

export type DatasetFreshnessLevel = 'pending' | 'fresh' | 'stale' | 'unavailable'

export interface DatasetFreshness {
  level: DatasetFreshnessLevel
  ageMs: number | null
  source: DatasetSource
  observedAtMs: number | null
  freshnessMs: number
}

export function classifyDatasetFreshness(meta: DatasetMeta, now: number): DatasetFreshness {
  const ageMs = meta.observedAtMs === null ? null : Math.max(0, now - meta.observedAtMs)
  const base = {
    ageMs,
    source: meta.source,
    observedAtMs: meta.observedAtMs,
    freshnessMs: meta.freshnessMs,
  }
  if (meta.status === 'failed')
    return { ...base, level: 'unavailable' }
  if (meta.status === 'uninitialized' || (meta.status === 'loading' && meta.observedAtMs === null))
    return { ...base, level: 'pending' }
  if (meta.observedAtMs === null || now < meta.observedAtMs || now - meta.observedAtMs >= meta.freshnessMs)
    return { ...base, level: 'stale' }
  return { ...base, level: 'fresh' }
}

export function formatDatasetAge(ageMs: number | null): string {
  if (ageMs === null)
    return 'unknown age'
  const seconds = Math.max(0, Math.floor(ageMs / 1000))
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`
  const days = Math.floor(hours / 24)
  return `${days}d${hours % 24 > 0 ? `${hours % 24}h` : ''}`
}
