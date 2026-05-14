import { mkdir } from 'node:fs/promises'
import process from 'node:process'

const OUTPUT_PATH = 'public/oracle-providers.json'
const DEFAULT_MONARCH_GIST_BASE_URL = 'https://gist.githubusercontent.com/starksama/087ce4682243a059d77b1361fcccf221/raw'

const SUPPORTED_CHAIN_IDS = [1, 8453, 42161, 137, 130, 999, 747474, 10, 143, 988] as const

const LABEL_BY_NORMALIZED: Record<string, string> = {
  api3: 'API3',
  apyx: 'APx',
  chainlink: 'Chainlink',
  chronicle: 'Chronicle',
  compound: 'Compound',
  erc4626: 'ERC4626',
  lido: 'Lido',
  midas: 'Midas',
  oval: 'Oval',
  pendle: 'Pendle',
  pyth: 'Pyth',
  redstone: 'Redstone',
  uma: 'UMA',
}

const DISPLAY_PRIORITY = [
  'Pendle',
  'API3',
  'Pyth',
  'Redstone',
  'Chronicle',
  'Midas',
  'Chainlink',
  'Oval',
  'Compound',
  'Lido',
  'ERC4626',
]

interface MonarchMeta {
  version?: string
  generatedAt?: string
  chains?: Record<string, unknown>
}

interface MonarchOracleFile {
  version?: string
  generatedAt?: string
  chainId?: number
  oracles?: MonarchOracle[]
}

interface ProviderLeg {
  vendor?: unknown
  provider?: unknown
}

interface OracleOutputData {
  baseFeedOne?: ProviderLeg | null
  baseFeedTwo?: ProviderLeg | null
  quoteFeedOne?: ProviderLeg | null
  quoteFeedTwo?: ProviderLeg | null
  baseVault?: ProviderLeg | null
  quoteVault?: ProviderLeg | null
}

interface MetaOracleData {
  primaryOracle?: string
  backupOracle?: string
  currentOracle?: string
  oracleSources?: {
    primary?: OracleOutputData | null
    backup?: OracleOutputData | null
  }
}

interface MonarchOracle {
  address?: unknown
  chainId?: unknown
  type?: unknown
  data?: unknown
}

interface OracleProvidersArtifact {
  version: 1
  generatedAt: string
  source: {
    kind: 'monarch-oracle-metadata'
    baseUrl: string
    metaVersion?: string
    metaGeneratedAt?: string
  }
  providersByChain: Record<string, Record<string, string>>
}

function parseArgValue(name: string) {
  const idx = Bun.argv.findIndex(a => a === name)
  if (idx === -1)
    return undefined
  return Bun.argv[idx + 1]
}

function normalizeAddress(value: unknown) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function normalizeProviderLabel(value: unknown) {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  if (!trimmed)
    return undefined

  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!key || key === 'unknown' || key === 'unknownfeed')
    return undefined

  return LABEL_BY_NORMALIZED[key] ?? trimmed
}

function addLegProvider(out: Set<string>, leg?: ProviderLeg | null) {
  if (!leg)
    return
  const label = normalizeProviderLabel(leg.vendor) ?? normalizeProviderLabel(leg.provider)
  if (label)
    out.add(label)
}

function collectProvidersFromOracleData(data?: OracleOutputData | null) {
  const out = new Set<string>()
  if (!data)
    return out

  addLegProvider(out, data.baseFeedOne)
  addLegProvider(out, data.baseFeedTwo)
  addLegProvider(out, data.quoteFeedOne)
  addLegProvider(out, data.quoteFeedTwo)
  addLegProvider(out, data.baseVault)
  addLegProvider(out, data.quoteVault)

  return out
}

function pickCurrentMetaOracleData(data: MetaOracleData): OracleOutputData | null {
  const current = normalizeAddress(data.currentOracle)
  const primary = normalizeAddress(data.primaryOracle)
  const backup = normalizeAddress(data.backupOracle)

  if (current && current === primary)
    return data.oracleSources?.primary ?? null
  if (current && current === backup)
    return data.oracleSources?.backup ?? null

  return data.oracleSources?.primary ?? data.oracleSources?.backup ?? null
}

function formatProviderLabel(providers: Set<string>) {
  const labels = [...providers]
  if (labels.length === 0)
    return undefined
  if (labels.length === 1)
    return labels[0]

  const sorted = labels.sort((a, b) => {
    const ai = DISPLAY_PRIORITY.indexOf(a)
    const bi = DISPLAY_PRIORITY.indexOf(b)
    const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai
    const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi
    return ar - br || a.localeCompare(b)
  })

  if (sorted.length <= 2)
    return sorted.join(' + ')

  return undefined
}

function deriveProviderLabel(oracle: MonarchOracle) {
  if (oracle.type === 'standard')
    return formatProviderLabel(collectProvidersFromOracleData(oracle.data as OracleOutputData))

  if (oracle.type === 'meta') {
    const currentData = pickCurrentMetaOracleData(oracle.data as MetaOracleData)
    return formatProviderLabel(collectProvidersFromOracleData(currentData))
  }

  return undefined
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok)
    throw new Error(`Fetch failed (${res.status}) ${url}`)
  return await res.json() as T
}

async function readPreviousArtifact(): Promise<OracleProvidersArtifact | undefined> {
  try {
    const file = Bun.file(OUTPUT_PATH)
    if (!(await file.exists()))
      return undefined
    return await file.json() as OracleProvidersArtifact
  }
  catch {
    return undefined
  }
}

async function main() {
  const baseUrl = (parseArgValue('--base-url') ?? process.env.MONARCH_ORACLE_GIST_BASE_URL ?? DEFAULT_MONARCH_GIST_BASE_URL).replace(/\/+$/, '')
  const meta = await fetchJson<MonarchMeta>(`${baseUrl}/meta.json`)
  const availableChains = new Set(Object.keys(meta.chains ?? {}).map(Number).filter(Number.isFinite))
  const chainIds = SUPPORTED_CHAIN_IDS.filter(chainId => availableChains.has(chainId))

  if (chainIds.length === 0)
    throw new Error('Monarch metadata has no chains matching MBM supported chains')

  const providersByChain: Record<string, Record<string, string>> = {}

  for (const chainId of chainIds) {
    const file = await fetchJson<MonarchOracleFile>(`${baseUrl}/oracles.${chainId}.json`)
    if (Number(file.chainId) !== chainId)
      throw new Error(`Chain mismatch for oracles.${chainId}.json: got ${file.chainId}`)
    if (!Array.isArray(file.oracles))
      throw new Error(`Invalid oracle file for chain ${chainId}: missing oracles array`)

    const providers: Record<string, string> = {}
    for (const oracle of file.oracles) {
      const address = normalizeAddress(oracle.address)
      if (!address)
        throw new Error(`Invalid oracle address in chain ${chainId}`)

      const label = deriveProviderLabel(oracle)
      if (label)
        providers[address] = label
    }

    providersByChain[String(chainId)] = Object.fromEntries(Object.entries(providers).sort(([a], [b]) => a.localeCompare(b)))
    console.log(`Chain ${chainId}: ${Object.keys(providers).length}/${file.oracles.length} oracle providers`)
  }

  const previous = await readPreviousArtifact()
  const providersUnchanged = JSON.stringify(previous?.providersByChain) === JSON.stringify(providersByChain)

  const artifact: OracleProvidersArtifact = {
    version: 1,
    generatedAt: providersUnchanged && previous?.generatedAt ? previous.generatedAt : new Date().toISOString(),
    source: {
      kind: 'monarch-oracle-metadata',
      baseUrl,
      metaVersion: providersUnchanged ? previous?.source.metaVersion : meta.version,
      metaGeneratedAt: providersUnchanged ? previous?.source.metaGeneratedAt : meta.generatedAt,
    },
    providersByChain: Object.fromEntries(Object.entries(providersByChain).sort(([a], [b]) => Number(a) - Number(b))),
  }

  await mkdir('public', { recursive: true })
  await Bun.write(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`)
  console.log(`Wrote oracle provider artifact to ${OUTPUT_PATH}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
