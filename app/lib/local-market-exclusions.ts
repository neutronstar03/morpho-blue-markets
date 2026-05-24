// Stores user-managed local collateral, oracle, and market exclusions in localStorage.
export interface LocalCollateralExclusionEntry {
  ts: number
  symbol?: string
  name?: string
}

export interface LocalMarketLostValueEntry {
  ts: number
  loanAssetSymbol?: string
  collateralAssetSymbol?: string
  loanAssetAddress?: string
  collateralAssetAddress?: string
}

export interface LocalOracleBlacklistEntry {
  ts: number
  provider?: string
  collateralSymbol?: string
}

export interface LocalCollateralExclusionRecord extends LocalCollateralExclusionEntry {
  chainId: number
  collateralAddress: string
}

export interface LocalMarketLostValueRecord extends LocalMarketLostValueEntry {
  chainId: number
  marketUniqueKey: string
}

export interface LocalOracleBlacklistRecord extends LocalOracleBlacklistEntry {
  chainId: number
  oracleAddress: string
}

const KEY_PREFIX = 'local-market-exclusions:v1:'
const OLD_COLLATERAL_KEY_PREFIX = 'local-collateral-blacklist:v1:'
const OLD_MARKET_WRITEOFF_KEY_PREFIX = 'local-market-writeoffs:v1:'
const CHANGE_EVENT = 'local-market-exclusions:changed'

let localMarketExclusionsVersion = 0
let didMigrateLegacyKeys = false

function normalizeId(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function normalizeAddress(address?: string | null) {
  const normalized = (address ?? '').trim()
  return normalized || undefined
}

function collateralKey(chainId: number, collateralAddress: string) {
  return `${KEY_PREFIX}collateral:${chainId}:${normalizeId(collateralAddress)}`
}

function marketKey(chainId: number, marketUniqueKey: string) {
  return `${KEY_PREFIX}market:${chainId}:${normalizeId(marketUniqueKey)}`
}

function oracleKey(chainId: number, oracleAddress: string) {
  return `${KEY_PREFIX}oracle:${chainId}:${normalizeId(oracleAddress)}`
}

function parseNewKey(key: string):
  | { kind: 'collateral', chainId: number, id: string }
  | { kind: 'market', chainId: number, id: string }
  | { kind: 'oracle', chainId: number, id: string }
  | undefined {
  if (!key.startsWith(KEY_PREFIX))
    return undefined

  const suffix = key.slice(KEY_PREFIX.length)
  const parts = suffix.split(':')
  if (parts.length < 3)
    return undefined

  const kind = parts[0]
  const chainId = Number.parseInt(parts[1], 10)
  const id = normalizeId(parts.slice(2).join(':'))
  const validKinds = ['collateral', 'market', 'oracle']
  if (!validKinds.includes(kind) || !Number.isFinite(chainId) || chainId <= 0 || !id)
    return undefined

  return { kind, chainId, id } as Extract<ReturnType<typeof parseNewKey>, { kind: string }>
}

function parseLegacyKey(key: string, prefix: string): { chainId: number, id: string } | undefined {
  if (!key.startsWith(prefix))
    return undefined
  const suffix = key.slice(prefix.length)
  const sep = suffix.indexOf(':')
  if (sep < 0)
    return undefined
  const chainId = Number.parseInt(suffix.slice(0, sep), 10)
  const id = normalizeId(suffix.slice(sep + 1))
  if (!Number.isFinite(chainId) || chainId <= 0 || !id)
    return undefined
  return { chainId, id }
}

function safeReadJson<T>(key: string): Partial<T> | undefined {
  if (typeof window === 'undefined')
    return undefined
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as Partial<T> : undefined
  }
  catch {
    return undefined
  }
}

function safeWrite(key: string, value: unknown | undefined) {
  if (typeof window === 'undefined')
    return
  try {
    if (!value)
      window.localStorage.removeItem(key)
    else
      window.localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // ignore storage errors
  }
}

// Defaults to Date.now() on invalid input so the sync system's last-writer-wins merge
// always has a usable timestamp for every entry; a missing sort key would break conflict resolution.
function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : Date.now()
}

function emitChange() {
  if (typeof window === 'undefined')
    return
  localMarketExclusionsVersion++
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function readCollateralEntry(key: string): LocalCollateralExclusionEntry | undefined {
  const parsed = safeReadJson<LocalCollateralExclusionEntry>(key)
  if (!parsed)
    return undefined
  return {
    ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
    symbol: typeof parsed.symbol === 'string' && parsed.symbol.trim() ? parsed.symbol.trim() : undefined,
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : undefined,
  }
}

function readMarketEntry(key: string): LocalMarketLostValueEntry | undefined {
  const parsed = safeReadJson<LocalMarketLostValueEntry>(key)
  if (!parsed)
    return undefined
  return {
    ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
    loanAssetSymbol: typeof parsed.loanAssetSymbol === 'string' && parsed.loanAssetSymbol.trim() ? parsed.loanAssetSymbol.trim() : undefined,
    collateralAssetSymbol: typeof parsed.collateralAssetSymbol === 'string' && parsed.collateralAssetSymbol.trim() ? parsed.collateralAssetSymbol.trim() : undefined,
    loanAssetAddress: normalizeAddress(parsed.loanAssetAddress),
    collateralAssetAddress: normalizeAddress(parsed.collateralAssetAddress),
  }
}

function readOracleEntry(key: string): LocalOracleBlacklistEntry | undefined {
  const parsed = safeReadJson<LocalOracleBlacklistEntry>(key)
  if (!parsed)
    return undefined
  return {
    ts: typeof parsed.ts === 'number' ? parsed.ts : 0,
    provider: typeof parsed.provider === 'string' && parsed.provider.trim() ? parsed.provider.trim() : undefined,
    collateralSymbol: typeof parsed.collateralSymbol === 'string' && parsed.collateralSymbol.trim() ? parsed.collateralSymbol.trim() : undefined,
  }
}

function migrateLegacyKeys() {
  if (typeof window === 'undefined' || didMigrateLegacyKeys)
    return
  didMigrateLegacyKeys = true

  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)).filter(Boolean) as string[]
    let migrated = false
    for (const key of keys) {
      const collateral = parseLegacyKey(key, OLD_COLLATERAL_KEY_PREFIX)
      if (collateral) {
        const entry = readCollateralEntry(key)
        if (entry) {
          safeWrite(collateralKey(collateral.chainId, collateral.id), entry)
          window.localStorage.removeItem(key)
          migrated = true
        }
        continue
      }

      const market = parseLegacyKey(key, OLD_MARKET_WRITEOFF_KEY_PREFIX)
      if (market) {
        const entry = readMarketEntry(key)
        if (entry) {
          safeWrite(marketKey(market.chainId, market.id), entry)
          window.localStorage.removeItem(key)
          migrated = true
        }
      }
    }
    if (migrated)
      emitChange()
  }
  catch {
    // ignore migration errors; old keys will remain local-only
  }
}

export function getLocalMarketExclusionsVersion() {
  migrateLegacyKeys()
  return localMarketExclusionsVersion
}

// Factories below deduplicate the read/write/list boilerplate across collateral/market/oracle exclusions, which all share the same localStorage shape.
function createIsExcluded<E>(
  keyFn: (chainId: number, id: string) => string,
  readEntry: (key: string) => E | undefined,
) {
  return (chainId?: number, id?: string | null) => {
    migrateLegacyKeys()
    if (chainId == null || !id)
      return false
    return readEntry(keyFn(chainId, id)) != null
  }
}

export const isCollateralLocallyExcluded = createIsExcluded(collateralKey, readCollateralEntry)
export const isMarketLocallyMarkedLostValue = createIsExcluded(marketKey, readMarketEntry)
export const isOracleLocallyExcluded = createIsExcluded(oracleKey, readOracleEntry)

export function setCollateralLocallyExcluded(
  chainId: number,
  collateralAddress: string,
  metadata?: { symbol?: string | null, name?: string | null },
) {
  migrateLegacyKeys()
  safeWrite(collateralKey(chainId, collateralAddress), {
    ts: Date.now(),
    symbol: typeof metadata?.symbol === 'string' && metadata.symbol.trim() ? metadata.symbol.trim() : undefined,
    name: typeof metadata?.name === 'string' && metadata.name.trim() ? metadata.name.trim() : undefined,
  })
  emitChange()
}

export function setCollateralLocallyExcludedWithTimestamp(
  chainId: number,
  collateralAddress: string,
  metadata?: { ts?: number, symbol?: string | null, name?: string | null },
) {
  migrateLegacyKeys()
  safeWrite(collateralKey(chainId, collateralAddress), {
    ts: normalizeTimestamp(metadata?.ts),
    symbol: typeof metadata?.symbol === 'string' && metadata.symbol.trim() ? metadata.symbol.trim() : undefined,
    name: typeof metadata?.name === 'string' && metadata.name.trim() ? metadata.name.trim() : undefined,
  })
  emitChange()
}

function createClearExcluded(keyFn: (chainId: number, id: string) => string) {
  return (chainId: number, id: string) => {
    migrateLegacyKeys()
    safeWrite(keyFn(chainId, id), undefined)
    emitChange()
  }
}

export const clearCollateralLocallyExcluded = createClearExcluded(collateralKey)
export const clearMarketLocallyMarkedLostValue = createClearExcluded(marketKey)
export const clearOracleLocallyExcluded = createClearExcluded(oracleKey)

export function setMarketLocallyMarkedLostValue(
  chainId: number,
  marketUniqueKey: string,
  metadata?: {
    loanAssetSymbol?: string | null
    collateralAssetSymbol?: string | null
    loanAssetAddress?: string | null
    collateralAssetAddress?: string | null
  },
) {
  migrateLegacyKeys()
  safeWrite(marketKey(chainId, marketUniqueKey), {
    ts: Date.now(),
    loanAssetSymbol: typeof metadata?.loanAssetSymbol === 'string' && metadata.loanAssetSymbol.trim() ? metadata.loanAssetSymbol.trim() : undefined,
    collateralAssetSymbol: typeof metadata?.collateralAssetSymbol === 'string' && metadata.collateralAssetSymbol.trim() ? metadata.collateralAssetSymbol.trim() : undefined,
    loanAssetAddress: normalizeAddress(metadata?.loanAssetAddress),
    collateralAssetAddress: normalizeAddress(metadata?.collateralAssetAddress),
  })
  emitChange()
}

export function setMarketLocallyMarkedLostValueWithTimestamp(
  chainId: number,
  marketUniqueKey: string,
  metadata?: {
    ts?: number
    loanAssetSymbol?: string | null
    collateralAssetSymbol?: string | null
    loanAssetAddress?: string | null
    collateralAssetAddress?: string | null
  },
) {
  migrateLegacyKeys()
  safeWrite(marketKey(chainId, marketUniqueKey), {
    ts: normalizeTimestamp(metadata?.ts),
    loanAssetSymbol: typeof metadata?.loanAssetSymbol === 'string' && metadata.loanAssetSymbol.trim() ? metadata.loanAssetSymbol.trim() : undefined,
    collateralAssetSymbol: typeof metadata?.collateralAssetSymbol === 'string' && metadata.collateralAssetSymbol.trim() ? metadata.collateralAssetSymbol.trim() : undefined,
    loanAssetAddress: normalizeAddress(metadata?.loanAssetAddress),
    collateralAssetAddress: normalizeAddress(metadata?.collateralAssetAddress),
  })
  emitChange()
}

export function setOracleLocallyExcluded(
  chainId: number,
  oracleAddress: string,
  metadata?: { provider?: string | null, collateralSymbol?: string | null },
) {
  migrateLegacyKeys()
  safeWrite(oracleKey(chainId, oracleAddress), {
    ts: Date.now(),
    provider: typeof metadata?.provider === 'string' && metadata.provider.trim() ? metadata.provider.trim() : undefined,
    collateralSymbol: typeof metadata?.collateralSymbol === 'string' && metadata.collateralSymbol.trim() ? metadata.collateralSymbol.trim() : undefined,
  })
  emitChange()
}

export function setOracleLocallyExcludedWithTimestamp(
  chainId: number,
  oracleAddress: string,
  metadata?: { ts?: number, provider?: string | null, collateralSymbol?: string | null },
) {
  migrateLegacyKeys()
  safeWrite(oracleKey(chainId, oracleAddress), {
    ts: normalizeTimestamp(metadata?.ts),
    provider: typeof metadata?.provider === 'string' && metadata.provider.trim() ? metadata.provider.trim() : undefined,
    collateralSymbol: typeof metadata?.collateralSymbol === 'string' && metadata.collateralSymbol.trim() ? metadata.collateralSymbol.trim() : undefined,
  })
  emitChange()
}

export function subscribeLocalMarketExclusions(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  migrateLegacyKeys()
  const onEvent = () => listener()
  const onStorage = (e: StorageEvent) => {
    if (!e.key)
      return
    if (e.key.startsWith(KEY_PREFIX) || e.key.startsWith(OLD_COLLATERAL_KEY_PREFIX) || e.key.startsWith(OLD_MARKET_WRITEOFF_KEY_PREFIX)) {
      didMigrateLegacyKeys = false
      migrateLegacyKeys()
      localMarketExclusionsVersion++
      listener()
    }
  }

  window.addEventListener(CHANGE_EVENT, onEvent)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onEvent)
    window.removeEventListener('storage', onStorage)
  }
}

function createListExcluded<E, R extends { chainId: number, ts: number }>(
  kind: string,
  readEntry: (key: string) => E | undefined,
  mapRecord: (parsedKey: { chainId: number, id: string }, entry: E) => R,
) {
  return (): R[] => {
    migrateLegacyKeys()
    if (typeof window === 'undefined')
      return []

    const out: R[] = []
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (!key)
          continue
        const parsedKey = parseNewKey(key)
        if (!parsedKey || parsedKey.kind !== kind)
          continue
        const entry = readEntry(key)
        if (!entry)
          continue
        out.push(mapRecord(parsedKey, entry))
      }
    }
    catch {
      return []
    }

    return out.sort((a, b) => b.ts - a.ts)
  }
}

export const listLocallyExcludedOracles = createListExcluded(
  'oracle',
  readOracleEntry,
  (parsedKey, entry) => ({
    chainId: parsedKey.chainId,
    oracleAddress: parsedKey.id,
    ts: entry.ts,
    provider: entry.provider,
    collateralSymbol: entry.collateralSymbol,
  }),
)

export const listLocallyExcludedCollaterals = createListExcluded(
  'collateral',
  readCollateralEntry,
  (parsedKey, entry) => ({
    chainId: parsedKey.chainId,
    collateralAddress: parsedKey.id,
    ts: entry.ts,
    symbol: entry.symbol,
    name: entry.name,
  }),
)

export const listMarketsLocallyMarkedLostValue = createListExcluded(
  'market',
  readMarketEntry,
  (parsedKey, entry) => ({
    chainId: parsedKey.chainId,
    marketUniqueKey: parsedKey.id,
    ts: entry.ts,
    loanAssetSymbol: entry.loanAssetSymbol,
    collateralAssetSymbol: entry.collateralAssetSymbol,
    loanAssetAddress: entry.loanAssetAddress,
    collateralAssetAddress: entry.collateralAssetAddress,
  }),
)
