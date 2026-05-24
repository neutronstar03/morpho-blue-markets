// Handles wallet-authenticated storage for user-managed blacklist preferences.
import { verifyMessage } from 'viem'

interface Env {
  USER_BLACKLIST: KVNamespace
}

interface TokenRecord {
  wallet: string
  createdAt: number
}

interface UserBlacklistBlob {
  // Compact KV shape: c=collaterals, o=oracles, w=lost-value writeoffs; u=blob timestamp; t=entry timestamp; s/n=symbol/name; p=provider; ls/cs=loan/collateral symbols; la/ca=loan/collateral addresses.
  v: 1
  u: number
  c?: Record<string, Record<string, { t: number, s?: string, n?: string }>>
  o?: Record<string, Record<string, { t: number, p?: string, cs?: string }>>
  w?: Record<string, Record<string, { t: number, ls?: string, cs?: string, la?: string, ca?: string }>>
}

const MAX_BODY_BYTES = 32 * 1024
const TOKEN_BYTES = 32
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365
const TOKEN_KEY_PREFIX = 'user-blacklist-token:v1:'
const BLOB_KEY_PREFIX = 'user-blacklist:v1:'

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init?.headers,
    },
  })
}

function errorResponse(error: string, status = 400) {
  return jsonResponse({ error }, { status })
}

function normalizeWallet(value: unknown) {
  const wallet = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : ''
}

function normalizeChainId(value: string) {
  return /^[1-9]\d{0,9}$/.test(value) ? value : ''
}

function normalizeAddress(value: string) {
  const normalized = value.trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : ''
}

function normalizeMarketId(value: string) {
  const normalized = value.trim().toLowerCase()
  return /^0x[a-f0-9]{1,128}$/.test(normalized) ? normalized : ''
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string')
    return undefined
  const text = value.trim()
  return text && text.length <= maxLength ? text : undefined
}

function normalizeTimestamp(value: unknown) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.round(timestamp) : 0
}

function emptyBlob(): UserBlacklistBlob {
  return { v: 1, u: Date.now(), c: {}, o: {}, w: {} }
}

function validateBlob(raw: unknown): UserBlacklistBlob | null {
  if (!raw || typeof raw !== 'object')
    return null

  const input = raw as UserBlacklistBlob
  const updatedAt = normalizeTimestamp(input.u)
  if (input.v !== 1 || !updatedAt)
    return null

  const blob: UserBlacklistBlob = { v: 1, u: updatedAt, c: {}, o: {}, w: {} }

  if (input.c != null) {
    // Sanitize collateral exclusions keyed as c[chainId][collateralAddress] with timestamp, symbol, and name metadata.
    if (typeof input.c !== 'object')
      return null
    for (const [rawChainId, entries] of Object.entries(input.c)) {
      const chainId = normalizeChainId(rawChainId)
      if (!chainId || !entries || typeof entries !== 'object')
        return null
      for (const [rawAddress, entry] of Object.entries(entries)) {
        const address = normalizeAddress(rawAddress)
        if (!address || !entry || typeof entry !== 'object')
          return null
        const value = entry as { t?: unknown, s?: unknown, n?: unknown }
        const t = normalizeTimestamp(value.t)
        if (!t)
          return null
        blob.c![chainId] ??= {}
        blob.c![chainId][address] = {
          t,
          s: normalizeText(value.s, 32),
          n: normalizeText(value.n, 120),
        }
      }
    }
  }

  if (input.o != null) {
    // Sanitize oracle exclusions keyed as o[chainId][oracleAddress] with timestamp, provider, and collateral symbol metadata.
    if (typeof input.o !== 'object')
      return null
    for (const [rawChainId, entries] of Object.entries(input.o)) {
      const chainId = normalizeChainId(rawChainId)
      if (!chainId || !entries || typeof entries !== 'object')
        return null
      for (const [rawAddress, entry] of Object.entries(entries)) {
        const address = normalizeAddress(rawAddress)
        if (!address || !entry || typeof entry !== 'object')
          return null
        const value = entry as { t?: unknown, p?: unknown, cs?: unknown }
        const t = normalizeTimestamp(value.t)
        if (!t)
          return null
        blob.o![chainId] ??= {}
        blob.o![chainId][address] = {
          t,
          p: normalizeText(value.p, 64),
          cs: normalizeText(value.cs, 32),
        }
      }
    }
  }

  if (input.w != null) {
    // Sanitize lost-value market exclusions keyed as w[chainId][marketUniqueKey] with timestamp plus loan/collateral metadata.
    if (typeof input.w !== 'object')
      return null
    for (const [rawChainId, entries] of Object.entries(input.w)) {
      const chainId = normalizeChainId(rawChainId)
      if (!chainId || !entries || typeof entries !== 'object')
        return null
      for (const [rawMarketId, entry] of Object.entries(entries)) {
        const marketId = normalizeMarketId(rawMarketId)
        if (!marketId || !entry || typeof entry !== 'object')
          return null
        const value = entry as { t?: unknown, ls?: unknown, cs?: unknown, la?: unknown, ca?: unknown }
        const t = normalizeTimestamp(value.t)
        if (!t)
          return null
        const la = normalizeText(value.la, 64)
        const ca = normalizeText(value.ca, 64)
        if ((la && !normalizeAddress(la)) || (ca && !normalizeAddress(ca)))
          return null
        blob.w![chainId] ??= {}
        blob.w![chainId][marketId] = {
          t,
          ls: normalizeText(value.ls, 32),
          cs: normalizeText(value.cs, 32),
          la: la ? normalizeAddress(la) : undefined,
          ca: ca ? normalizeAddress(ca) : undefined,
        }
      }
    }
  }

  return blob
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function createToken() {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function readJsonBody(request: Request) {
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES)
    return { error: 'Payload too large' }
  try {
    return { data: raw ? JSON.parse(raw) : null }
  }
  catch {
    return { error: 'Invalid JSON' }
  }
}

async function walletForToken(env: Env, request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const [scheme, ...rest] = header.trim().split(/\s+/)
  const token = scheme?.toLowerCase() === 'bearer' ? rest.join(' ').trim() : ''
  if (!token)
    return null

  const hash = await sha256Hex(token)
  const raw = await env.USER_BLACKLIST.get(`${TOKEN_KEY_PREFIX}${hash}`)
  if (!raw)
    return null
  try {
    const record = JSON.parse(raw) as TokenRecord
    return normalizeWallet(record.wallet)
  }
  catch {
    return null
  }
}

async function readBlob(env: Env, wallet: string) {
  const raw = await env.USER_BLACKLIST.get(`${BLOB_KEY_PREFIX}${wallet}`)
  if (!raw)
    return emptyBlob()
  try {
    return validateBlob(JSON.parse(raw)) ?? emptyBlob()
  }
  catch {
    return emptyBlob()
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204 })
}

export async function onRequestPost(context: EventContext<Env>): Promise<Response> {
  const body = await readJsonBody(context.request)
  if (body.error)
    return errorResponse(body.error)

  const input = body.data as { wallet?: unknown, message?: unknown, signature?: unknown } | null
  const wallet = normalizeWallet(input?.wallet)
  const message = typeof input?.message === 'string' ? input.message : ''
  const signature = typeof input?.signature === 'string' ? input.signature : ''
  if (!wallet || !message || !signature)
    return errorResponse('Missing or invalid auth payload')
  if (!message.startsWith('MBM blacklist sync') || !message.includes(`Wallet: ${wallet}`))
    return errorResponse('Invalid sync message')

  const verified = await verifyMessage({ address: wallet as `0x${string}`, message, signature: signature as `0x${string}` })
  if (!verified)
    return errorResponse('Invalid signature', 401)

  const token = createToken()
  const tokenHash = await sha256Hex(token)
  await context.env.USER_BLACKLIST.put(`${TOKEN_KEY_PREFIX}${tokenHash}`, JSON.stringify({ wallet, createdAt: Date.now() }), { expirationTtl: TOKEN_TTL_SECONDS })

  return jsonResponse({ token, blob: await readBlob(context.env, wallet) })
}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const wallet = await walletForToken(context.env, context.request)
  if (!wallet)
    return errorResponse('Unauthorized', 401)
  return jsonResponse({ blob: await readBlob(context.env, wallet) })
}

export async function onRequestPut(context: EventContext<Env>): Promise<Response> {
  const wallet = await walletForToken(context.env, context.request)
  if (!wallet)
    return errorResponse('Unauthorized', 401)

  const body = await readJsonBody(context.request)
  if (body.error)
    return errorResponse(body.error)
  const blob = validateBlob(body.data)
  if (!blob)
    return errorResponse('Invalid blacklist blob')

  const stored = await readBlob(context.env, wallet)
  // Allow 5s of clock skew between client and server; only reject blobs that are genuinely stale.
  if (blob.u < stored.u - 5000)
    return errorResponse('Incoming blacklist blob is stale', 409)

  await context.env.USER_BLACKLIST.put(`${BLOB_KEY_PREFIX}${wallet}`, JSON.stringify(blob))
  return jsonResponse({ blob })
}
