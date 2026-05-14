import { useEffect, useSyncExternalStore } from 'react'

interface OracleProvidersArtifact {
  version: number
  generatedAt?: string
  providersByChain?: Record<string, Record<string, string>>
}

type OracleProvidersStatus = 'uninitialized' | 'loading' | 'loaded' | 'failed'

interface OracleProvidersState {
  status: OracleProvidersStatus
  providersByChain: Record<number, Record<string, string>>
}

const CHANGE_EVENT = 'oracle-providers:changed'

const LOCAL_URL_PATH = 'oracle-providers.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/oracle-providers.json'

const LS_CACHE_KEY = 'oracle-providers-cache:v1'

let oracleProvidersVersion = 0
let oracleProvidersState: OracleProvidersState = {
  status: 'uninitialized',
  providersByChain: {},
}

function normalizeAddress(address?: string | null) {
  const s = (address ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  oracleProvidersVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function setState(next: OracleProvidersState) {
  oracleProvidersState = next
  emitChange()
}

function buildProvidersByChain(input: unknown) {
  const artifact = input as OracleProvidersArtifact | undefined
  const source = artifact?.providersByChain
  const out: Record<number, Record<string, string>> = {}
  if (!source || typeof source !== 'object')
    return out

  for (const [chainIdRaw, providers] of Object.entries(source)) {
    const chainId = Number(chainIdRaw)
    if (!Number.isFinite(chainId) || chainId <= 0 || !providers || typeof providers !== 'object')
      continue

    const normalizedProviders: Record<string, string> = {}
    for (const [addressRaw, labelRaw] of Object.entries(providers)) {
      const address = normalizeAddress(addressRaw)
      const label = typeof labelRaw === 'string' ? labelRaw.trim() : ''
      if (address && label)
        normalizedProviders[address] = label
    }

    if (Object.keys(normalizedProviders).length > 0)
      out[chainId] = normalizedProviders
  }

  return out
}

let loadPromise: Promise<void> | null = null

function safeReadCache(): unknown | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as any
    return parsed?.artifact
  }
  catch {
    return undefined
  }
}

function safeWriteCache(artifact: unknown) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
      cachedAtMs: Date.now(),
      artifact,
    }))
  }
  catch {
    // ignore
  }
}

function baseUrlPrefix() {
  const base = (import.meta as any).env?.BASE_URL as string | undefined
  return base && typeof base === 'string' ? base : '/'
}

function shouldTryLocalStaticFile() {
  return Boolean((import.meta as any).env?.DEV)
}

async function fetchJson(url: string) {
  return await fetch(url, { headers: { accept: 'application/json' } })
}

async function readJsonResponse(res: Response) {
  if (!res.ok)
    return undefined
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('text/html'))
    return undefined
  try {
    return await res.json()
  }
  catch {
    return undefined
  }
}

export function ensureOracleProvidersLoaded() {
  if (typeof window === 'undefined')
    return
  if (oracleProvidersState.status === 'loaded' || oracleProvidersState.status === 'failed')
    return
  if (loadPromise)
    return

  setState({ ...oracleProvidersState, status: 'loading' })
  loadPromise = (async () => {
    try {
      const localRes = shouldTryLocalStaticFile()
        ? await fetchJson(`${baseUrlPrefix()}${LOCAL_URL_PATH}`)
        : undefined
      const localJson = localRes ? await readJsonResponse(localRes) : undefined

      if (localJson !== undefined) {
        safeWriteCache(localJson)
        setState({ status: 'loaded', providersByChain: buildProvidersByChain(localJson) })
        return
      }

      if (!localRes || localRes.status === 404 || localRes.ok) {
        const artifactsRes = await fetchJson(ARTIFACTS_URL)
        const artifactsJson = await readJsonResponse(artifactsRes)
        if (artifactsJson !== undefined) {
          safeWriteCache(artifactsJson)
          setState({ status: 'loaded', providersByChain: buildProvidersByChain(artifactsJson) })
          return
        }

        if (artifactsRes.status === 404) {
          setState({ status: 'loaded', providersByChain: {} })
          return
        }
      }

      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', providersByChain: buildProvidersByChain(cached) })
        return
      }

      setState({ status: 'failed', providersByChain: {} })
    }
    catch {
      const cached = safeReadCache()
      if (cached) {
        setState({ status: 'loaded', providersByChain: buildProvidersByChain(cached) })
        return
      }
      setState({ status: 'failed', providersByChain: {} })
    }
  })().finally(() => {
    loadPromise = null
  })
}

export function getOracleProvidersVersion() {
  return oracleProvidersVersion
}

export function subscribeOracleProviders(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  return () => window.removeEventListener(CHANGE_EVENT, onEvent)
}

export function useOracleProvidersVersion() {
  return useSyncExternalStore(
    subscribeOracleProviders,
    () => getOracleProvidersVersion(),
    () => 0,
  )
}

export function useOracleProvidersPreload() {
  useEffect(() => {
    ensureOracleProvidersLoaded()
  }, [])
}

export function getOracleProvider(chainId?: number, oracleAddress?: string | null) {
  if (chainId == null)
    return undefined
  const address = normalizeAddress(oracleAddress)
  if (!address)
    return undefined
  return oracleProvidersState.providersByChain[chainId]?.[address]
}
