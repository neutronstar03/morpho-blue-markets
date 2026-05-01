import { useEffect, useSyncExternalStore } from 'react'
import blacklistAssets from './blacklist.assets.json'

interface BlacklistMarketEntry {
  chainId: number
  uniqueKey: string
}

interface ManualBlacklistMarketEntry extends BlacklistMarketEntry {
  comment?: string
}

type BlacklistStatus = 'uninitialized' | 'loading' | 'loaded' | 'failed'

interface BlacklistState {
  status: BlacklistStatus
  marketIdsByChain: Record<number, Set<string>>
  manualMarketIdsByChain: Record<number, Set<string>>
}

const CHANGE_EVENT = 'market-blacklist:changed'

const LOCAL_URL_PATH = 'blacklist.markets.json'
const LOCAL_MANUAL_URL_PATH = 'blacklist.markets.manual.json'
const ARTIFACTS_URL = 'https://neutronstar03.github.io/mbm-artifacts/v1/blacklist.markets.json'

const LS_CACHE_KEY = 'market-blacklist-cache:v1'

let blacklistVersion = 0
let blacklistState: BlacklistState = {
  status: 'uninitialized',
  marketIdsByChain: {},
  manualMarketIdsByChain: {},
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  blacklistVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function setState(next: BlacklistState) {
  blacklistState = next
  emitChange()
}

function normalizeMarketId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

function buildMarketIdsByChain(entries: unknown) {
  const out: Record<number, Set<string>> = {}
  const arr = Array.isArray(entries) ? entries : []
  for (const item of arr) {
    if (!item || typeof item !== 'object')
      continue
    const e = item as Partial<BlacklistMarketEntry>
    const chainId = Number(e.chainId)
    const uniqueKey = normalizeMarketId(e.uniqueKey)
    if (!Number.isFinite(chainId) || chainId <= 0 || !uniqueKey)
      continue
    if (!out[chainId])
      out[chainId] = new Set<string>()
    out[chainId].add(uniqueKey)
  }
  return out
}

function mergeMarketIdsByChain(
  ...maps: Array<Record<number, Set<string>>>
) {
  const out: Record<number, Set<string>> = {}
  for (const map of maps) {
    for (const [chainIdRaw, values] of Object.entries(map)) {
      const chainId = Number(chainIdRaw)
      if (!out[chainId])
        out[chainId] = new Set<string>()
      for (const value of values)
        out[chainId].add(value)
    }
  }
  return out
}

function safeReadCache(): unknown | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY)
    if (!raw)
      return undefined
    const parsed = JSON.parse(raw) as any
    return parsed?.entries
  }
  catch {
    return undefined
  }
}

function safeWriteCache(entries: unknown) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
      cachedAtMs: Date.now(),
      entries,
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
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  return res
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

async function fetchOptionalJson(url: string) {
  try {
    const res = await fetchJson(url)
    return await readJsonResponse(res)
  }
  catch {
    return undefined
  }
}

let loadPromise: Promise<void> | null = null

export function ensureMarketBlacklistLoaded() {
  if (typeof window === 'undefined')
    return
  if (blacklistState.status === 'loaded' || blacklistState.status === 'failed')
    return
  if (loadPromise)
    return

  setState({ ...blacklistState, status: 'loading' })
  loadPromise = (async () => {
    try {
      const manualEntries = shouldTryLocalStaticFile()
        ? await fetchOptionalJson(`${baseUrlPrefix()}${LOCAL_MANUAL_URL_PATH}`)
        : undefined
      const manualMarketIdsByChain = buildMarketIdsByChain(manualEntries as ManualBlacklistMarketEntry[] | undefined)
      const localRes = shouldTryLocalStaticFile()
        ? await fetchJson(`${baseUrlPrefix()}${LOCAL_URL_PATH}`)
        : undefined
      const localJson = localRes ? await readJsonResponse(localRes) : undefined
      if (localJson !== undefined) {
        safeWriteCache(localJson)
        const generatedMarketIdsByChain = buildMarketIdsByChain(localJson)
        setState({
          status: 'loaded',
          marketIdsByChain: mergeMarketIdsByChain(generatedMarketIdsByChain, manualMarketIdsByChain),
          manualMarketIdsByChain,
        })
        return
      }

      if (!localRes || localRes.status === 404 || localRes.ok) {
        const artifactsRes = await fetchJson(ARTIFACTS_URL)
        const artifactsJson = await readJsonResponse(artifactsRes)
        if (artifactsJson !== undefined) {
          safeWriteCache(artifactsJson)
          const generatedMarketIdsByChain = buildMarketIdsByChain(artifactsJson)
          setState({
            status: 'loaded',
            marketIdsByChain: mergeMarketIdsByChain(generatedMarketIdsByChain, manualMarketIdsByChain),
            manualMarketIdsByChain,
          })
          return
        }

        if (artifactsRes.status === 404) {
          setState({
            status: 'loaded',
            marketIdsByChain: manualMarketIdsByChain,
            manualMarketIdsByChain,
          })
          return
        }
      }

      const cached = safeReadCache()
      if (cached) {
        const generatedMarketIdsByChain = buildMarketIdsByChain(cached)
        setState({
          status: 'loaded',
          marketIdsByChain: mergeMarketIdsByChain(generatedMarketIdsByChain, manualMarketIdsByChain),
          manualMarketIdsByChain,
        })
        return
      }

      setState({
        status: 'failed',
        marketIdsByChain: manualMarketIdsByChain,
        manualMarketIdsByChain,
      })
    }
    catch {
      const manualEntries = shouldTryLocalStaticFile()
        ? await fetchOptionalJson(`${baseUrlPrefix()}${LOCAL_MANUAL_URL_PATH}`)
        : undefined
      const manualMarketIdsByChain = buildMarketIdsByChain(manualEntries as ManualBlacklistMarketEntry[] | undefined)
      const cached = safeReadCache()
      if (cached) {
        const generatedMarketIdsByChain = buildMarketIdsByChain(cached)
        setState({
          status: 'loaded',
          marketIdsByChain: mergeMarketIdsByChain(generatedMarketIdsByChain, manualMarketIdsByChain),
          manualMarketIdsByChain,
        })
        return
      }
      setState({
        status: 'failed',
        marketIdsByChain: manualMarketIdsByChain,
        manualMarketIdsByChain,
      })
    }
  })().finally(() => {
    loadPromise = null
  })
}

export function getMarketBlacklistVersion() {
  return blacklistVersion
}

export function subscribeMarketBlacklist(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}
  const onEvent = () => listener()
  window.addEventListener(CHANGE_EVENT, onEvent)
  return () => window.removeEventListener(CHANGE_EVENT, onEvent)
}

export function useMarketBlacklistVersion() {
  return useSyncExternalStore(
    subscribeMarketBlacklist,
    () => getMarketBlacklistVersion(),
    () => 0,
  )
}

export function useMarketBlacklistPreload() {
  useEffect(() => {
    ensureMarketBlacklistLoaded()
  }, [])
}

const BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN: Record<number, Set<string>> = Object.fromEntries(
  Object.entries(blacklistAssets as Record<string, Array<{ assetContract: string }>>).map(
    ([chainId, assets]) => [
      Number(chainId),
      new Set(assets.map(asset => asset.assetContract.toLowerCase())),
    ],
  ),
)

const PENDLE_MONTHS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
}

function normalizeId(value?: string | null) {
  return value?.toLowerCase() ?? undefined
}

// Kick off best-effort load early in the client.
if (typeof window !== 'undefined')
  ensureMarketBlacklistLoaded()

function formatTodayPendleSortable() {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())
  return Number(`${year}${month}${day}`)
}

function parsePendleExpiryFromSymbol(symbol?: string | null) {
  if (!symbol)
    return undefined
  const match = /(?:^|-)\d{2}[A-Z]{3}\d{4}(?:$|\s)/.exec(symbol.toUpperCase())
  if (!match)
    return undefined
  const dateToken = match[0].replace(/(^-|\s$)/g, '')
  const day = dateToken.slice(0, 2)
  const monthToken = dateToken.slice(2, 5)
  const year = dateToken.slice(5)
  const month = PENDLE_MONTHS[monthToken]
  if (!month)
    return undefined
  return Number(`${year}${month}${day}`)
}

function isPendleSymbolExpired(symbol?: string | null) {
  if (!symbol)
    return false
  const normalized = symbol.toUpperCase()
  if (!normalized.startsWith('PT-') && !normalized.startsWith('WRAPPED-LP-'))
    return false
  const expiry = parsePendleExpiryFromSymbol(normalized)
  if (!expiry)
    return false
  return expiry < formatTodayPendleSortable()
}

function normalizeSymbol(symbol?: string | null) {
  return symbol?.trim().toUpperCase() ?? ''
}

const MANUAL_BLACKLISTED_SYMBOLS = new Set([
  'APRUSR',
  'MC-USR',
])

const MANUAL_BLACKLISTED_SYMBOL_PREFIXES = [
  'PT-RLP-',
  'PT-SW-RLP-',
  'PT-USR-',
  'PT-WSTUSR-',
  'LP-USR-',
  'BWPT-USR-',
]

function isManuallyBlacklistedSymbol(symbol?: string | null) {
  const normalized = normalizeSymbol(symbol)
  if (!normalized)
    return false
  if (MANUAL_BLACKLISTED_SYMBOLS.has(normalized))
    return true
  return MANUAL_BLACKLISTED_SYMBOL_PREFIXES.some(prefix => normalized.startsWith(prefix))
}

function hasValueInChainMap(
  map: Record<number, Set<string>>,
  value: string | null | undefined,
  chainId?: number,
) {
  const normalized = normalizeId(value)
  if (!normalized)
    return false
  if (chainId != null) {
    const set = map[chainId]
    return set ? set.has(normalized) : false
  }
  return Object.values(map).some(set => set.has(normalized))
}

export function isAssetBlacklisted(address?: string | null, chainId?: number) {
  return hasValueInChainMap(BLACKLISTED_ASSET_ADDRESSES_BY_CHAIN, address, chainId)
}

export function isMarketIdBlacklisted(uniqueKey?: string | null, chainId?: number) {
  return hasValueInChainMap(blacklistState.marketIdsByChain, uniqueKey, chainId)
}

export function isMarketIdManuallyBlacklisted(uniqueKey?: string | null, chainId?: number) {
  return hasValueInChainMap(blacklistState.manualMarketIdsByChain, uniqueKey, chainId)
}

export function isMarketBlacklisted(args: {
  uniqueKey?: string | null
  loanAssetAddress?: string | null
  collateralAssetAddress?: string | null
  loanAssetSymbol?: string | null
  collateralAssetSymbol?: string | null
  chainId?: number
}) {
  return (
    isMarketIdBlacklisted(args.uniqueKey, args.chainId)
    || isAssetBlacklisted(args.loanAssetAddress, args.chainId)
    || isAssetBlacklisted(args.collateralAssetAddress, args.chainId)
    || isManuallyBlacklistedSymbol(args.loanAssetSymbol)
    || isManuallyBlacklistedSymbol(args.collateralAssetSymbol)
    || isPendleSymbolExpired(args.loanAssetSymbol)
    || isPendleSymbolExpired(args.collateralAssetSymbol)
  )
}

export function filterBlacklistedMarkets<T>(
  markets: T[],
  getArgs: (market: T) => {
    uniqueKey?: string | null
    loanAssetAddress?: string | null
    collateralAssetAddress?: string | null
    loanAssetSymbol?: string | null
    collateralAssetSymbol?: string | null
    chainId?: number
  },
) {
  return markets.filter(market => !isMarketBlacklisted(getArgs(market)))
}
