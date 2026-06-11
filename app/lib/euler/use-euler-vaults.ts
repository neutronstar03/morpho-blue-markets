import { useQuery } from '@tanstack/react-query'
import { gql, GraphQLClient } from 'graphql-request'
import { createPublicClient, fallback, formatUnits, http, parseAbi } from 'viem'
import { mainnet } from 'viem/chains'
import { fetchLlamaPrices } from '~/lib/defillama'
import { EULER_CHAINS } from './chains'

const PAGE_SIZE = 1000
const RAY_DECIMALS = 27
const SECONDS_PER_YEAR = 31_556_952
const INTEREST_FEE_SCALE = 10_000
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const MAX_DEPOSIT_RECEIVER = '0x0000000000000000000000000000000000000001'

type EulerIrmType = 'unknown' | 'kink' | 'adaptiveCurve' | 'kinky' | 'fixedCyclicalBinary'

interface EulerIrmInfo {
  type: EulerIrmType
  label: string
}

interface EulerVaultMetadata {
  marketName: string
  description: string | null
  portfolioNotice: string | null
  deprecationReason: string | null
  deprecated: boolean
  governanceLimited: boolean
  productId: string | null
  entities: string[]
}

interface EulerLiveVaultState {
  totalAssets?: bigint
  totalBorrows?: bigint
  cash?: bigint
  interestRate?: bigint
  interestFee?: bigint
  maxDeposit?: bigint
}

const UNKNOWN_IRM_INFO: EulerIrmInfo = {
  type: 'unknown',
  label: 'Unknown',
}

const IRM_TYPE_BY_ID: Record<number, EulerIrmInfo> = {
  0: UNKNOWN_IRM_INFO,
  1: { type: 'kink', label: 'Kink' },
  2: { type: 'adaptiveCurve', label: 'Adaptive Curve' },
  3: { type: 'kinky', label: 'Kinky' },
  4: { type: 'fixedCyclicalBinary', label: 'Fixed Cyclical Binary' },
}

const IRM_LENS_ABI = parseAbi([
  'function getInterestRateModelInfo(address irm) view returns ((address interestRateModel, uint8 interestRateModelType, bytes interestRateModelParams))',
])

const VAULT_STATE_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function totalBorrows() view returns (uint256)',
  'function cash() view returns (uint256)',
  'function interestRate() view returns (uint256)',
  'function interestFee() view returns (uint16)',
  'function maxDeposit(address receiver) view returns (uint256)',
])

export interface EulerVaultRaw {
  id: string
  name: string
  symbol: string
  decimals: string
  borrowCap: string
  supplyCap: string
  asset: string | null
  oracle: string
  interestRateModel: string
  creator: string
  governonAdmin: string
  collaterals: string[] | null
  perspectives: string[] | null
  state: {
    totalShares: string
    totalBorrows: string
    accumulatedFees: string
    cash: string
    interestRate: string
    supplyApy: string
    borrowApy: string
    timestamp: string
  } | null
}

interface EulerVaultsResponse {
  eulerVaults: EulerVaultRaw[]
}

export interface EulerRelatedVault {
  address: `0x${string}`
  symbol: string
  assetSymbol: string
  utilization: number
  isSupplyEnabled: boolean
  totalAssetsUsd?: number
  cashUsd?: number
  supplyApy: number
  deprecated: boolean
  governanceLimited: boolean
  deprecationReason: string | null
  marketName: string | null
}

export interface EulerVaultRow {
  chainId: number
  chainName: string
  vaultAddress: `0x${string}`
  name: string
  symbol: string
  assetAddress?: `0x${string}`
  assetSymbol: string
  decimals: number
  priceUsd?: number
  totalAssets: bigint
  cash: bigint
  totalBorrows: bigint
  totalAssetsUsd?: number
  cashUsd?: number
  totalBorrowsUsd?: number
  utilization: number
  supplyApy: number
  borrowApy: number
  supplyCap: bigint
  borrowCap: bigint
  maxDeposit: bigint
  isSupplyEnabled: boolean
  deprecated: boolean
  governanceLimited: boolean
  deprecationReason: string | null
  marketName: string | null
  marketDescription: string | null
  portfolioNotice: string | null
  productId: string | null
  entities: string[]
  oracle: `0x${string}`
  interestRateModel: `0x${string}`
  interestRateModelType: EulerIrmType
  interestRateModelLabel: string
  creator: `0x${string}`
  governonAdmin: `0x${string}`
  collateralAddresses: `0x${string}`[]
  acceptedCollaterals: EulerRelatedVault[]
  usedAsCollateralBy: EulerRelatedVault[]
  perspectives: string[]
  perspectiveLabel: string
  hasOracle: boolean
}

export interface EulerVaultExplorerData {
  rows: EulerVaultRow[]
  rawCount: number
  pricedAssetCount: number
  deprecatedCount: number
  governanceLimitedCount: number
  updatedAt?: number
}

const QUERY_EULER_VAULTS = gql`
  query EulerVaults($first: Int!, $skip: Int!) {
    eulerVaults(
      first: $first
      skip: $skip
      orderBy: state__supplyApy
      orderDirection: desc
    ) {
      id
      name
      symbol
      decimals
      borrowCap
      supplyCap
      asset
      oracle
      interestRateModel
      creator
      governonAdmin
      collaterals
      perspectives
      state {
        totalShares
        totalBorrows
        accumulatedFees
        cash
        interestRate
        supplyApy
        borrowApy
        timestamp
      }
    }
  }
`

function asAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`
}

function parseBigint(value: string | null | undefined) {
  if (!value)
    return 0n
  try {
    return BigInt(value)
  }
  catch {
    return 0n
  }
}

function parseDecimal(value: string | null | undefined, decimals: number) {
  const raw = parseBigint(value)
  if (raw === 0n)
    return 0
  return Number.parseFloat(formatUnits(raw, decimals))
}

function parseRay(value: string | null | undefined) {
  return parseDecimal(value, RAY_DECIMALS)
}

function liveBorrowApy(interestRate: bigint | undefined) {
  if (interestRate == null)
    return undefined
  if (interestRate === 0n)
    return 0
  return Math.expm1(Number.parseFloat(formatUnits(interestRate, RAY_DECIMALS)) * SECONDS_PER_YEAR)
}

function liveSupplyApy(interestRate: bigint | undefined, utilization: number, interestFee: bigint | undefined) {
  if (interestRate === 0n)
    return 0

  const borrowApyInput = interestRate == null
    ? undefined
    : Number.parseFloat(formatUnits(interestRate, RAY_DECIMALS))
  if (borrowApyInput == null)
    return undefined

  const feeMultiplier = Math.max(0, 1 - Number(interestFee ?? 0n) / INTEREST_FEE_SCALE)
  return Math.expm1(borrowApyInput * SECONDS_PER_YEAR * utilization * feeMultiplier)
}

function numberFromBigint(value: bigint, decimals: number) {
  if (value === 0n)
    return 0
  return Number.parseFloat(formatUnits(value, decimals))
}

function fallbackAssetSymbol(vaultSymbol: string) {
  return vaultSymbol.replace(/^e/i, '').replace(/-\d+$/, '') || vaultSymbol
}

function perspectiveLabel(perspectives: string[]) {
  if (perspectives.includes('governedPerspective'))
    return 'Governed'
  if (perspectives.includes('escrowedCollateralPerspective'))
    return 'Escrow'
  if (perspectives.includes('evkFactoryPerspective'))
    return 'Factory'
  return 'Raw'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function nullableString(value: unknown) {
  if (value == null)
    return null
  return typeof value === 'string' ? value : null
}

function parseMetadataEntityName(value: unknown) {
  if (!isRecord(value))
    return null
  return typeof value.name === 'string' ? value.name : null
}

function parseVaultMetadata(value: unknown): EulerVaultMetadata | null {
  if (!isRecord(value))
    return null
  if (typeof value.address !== 'string' || typeof value.name !== 'string')
    return null

  return {
    marketName: value.name,
    description: nullableString(value.description),
    portfolioNotice: nullableString(value.portfolioNotice),
    deprecationReason: nullableString(value.deprecationReason),
    deprecated: value.deprecated === true,
    governanceLimited: value.governanceLimited === true,
    productId: nullableString(value.productId),
    entities: Array.isArray(value.entities)
      ? value.entities.map(parseMetadataEntityName).filter((name): name is string => name != null)
      : [],
  }
}

async function fetchAllVaults() {
  const all: EulerVaultRaw[] = []
  for (const chain of EULER_CHAINS) {
    const client = new GraphQLClient(chain.goldskyEndpoint)
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const page = await client.request<EulerVaultsResponse>(QUERY_EULER_VAULTS, {
        first: PAGE_SIZE,
        skip,
      })
      all.push(...page.eulerVaults)
      if (page.eulerVaults.length < PAGE_SIZE)
        break
    }
  }
  return all
}

async function fetchMetadataMap() {
  const result: Record<string, EulerVaultMetadata> = {}

  for (const chain of EULER_CHAINS) {
    const response = await fetch(chain.metadataEndpoint)
    if (!response.ok)
      throw new Error(`Failed to load Euler metadata for ${chain.chainName}.`)

    const raw: unknown = await response.json()
    if (!isRecord(raw))
      throw new Error(`Euler metadata for ${chain.chainName} returned an unexpected shape.`)

    for (const [address, metadata] of Object.entries(raw)) {
      if (!address.startsWith('0x'))
        continue
      const parsed = parseVaultMetadata(metadata)
      if (parsed)
        result[address.toLowerCase()] = parsed
    }
  }

  return result
}

async function fetchPriceMap(vaults: EulerVaultRaw[]) {
  const chain = EULER_CHAINS[0]
  const keys = Array.from(new Set(
    vaults
      .map(vault => vault.asset?.toLowerCase())
      .filter((asset): asset is string => !!asset && asset !== ZERO_ADDRESS)
      .map(asset => `${chain.defillamaSlug}:${asset}`),
  ))

  const chunks: string[][] = []
  for (let i = 0; i < keys.length; i += 80)
    chunks.push(keys.slice(i, i + 80))

  const responses = await Promise.all(chunks.map(chunk => fetchLlamaPrices(chunk)))
  return responses.reduce<Record<string, { decimals?: number, symbol?: string, price?: number }>>((acc, response) => {
    for (const [key, value] of Object.entries(response.coins))
      acc[key.toLowerCase()] = value
    return acc
  }, {})
}

async function fetchIrmInfoMap(vaults: EulerVaultRaw[]) {
  const chain = EULER_CHAINS[0]
  const irmAddresses = Array.from(new Set(
    vaults
      .map(vault => vault.interestRateModel?.toLowerCase())
      .filter((address): address is `0x${string}` => !!address && address !== ZERO_ADDRESS),
  ))

  if (irmAddresses.length === 0)
    return {}

  const client = createPublicClient({
    chain: mainnet,
    transport: fallback(chain.rpcUrls.map(url => http(url))),
  })

  const result: Record<string, EulerIrmInfo> = {}
  try {
    for (let i = 0; i < irmAddresses.length; i += 100) {
      const chunk = irmAddresses.slice(i, i + 100)
      const reads = await client.multicall({
        allowFailure: true,
        contracts: chunk.map(irm => ({
          address: chain.irmLensAddress,
          abi: IRM_LENS_ABI,
          functionName: 'getInterestRateModelInfo',
          args: [irm],
        })),
      })

      reads.forEach((read, index) => {
        if (read.status !== 'success')
          return
        const modelInfo = read.result as { interestRateModelType: number }
        const irm = chunk[index]
        if (!irm)
          return
        result[irm] = IRM_TYPE_BY_ID[Number(modelInfo.interestRateModelType)] ?? UNKNOWN_IRM_INFO
      })
    }
  }
  catch {
    return {}
  }

  return result
}

async function fetchLiveVaultStateMap(vaults: EulerVaultRaw[]) {
  const chain = EULER_CHAINS[0]
  const vaultAddresses = Array.from(new Set(
    vaults
      .map(vault => vault.id?.toLowerCase())
      .filter((address): address is `0x${string}` => !!address && address !== ZERO_ADDRESS),
  ))

  if (vaultAddresses.length === 0)
    return {}

  const client = createPublicClient({
    chain: mainnet,
    transport: fallback(chain.rpcUrls.map(url => http(url))),
  })

  const result: Record<string, EulerLiveVaultState> = {}
  try {
    for (let i = 0; i < vaultAddresses.length; i += 50) {
      const chunk = vaultAddresses.slice(i, i + 50)
      const reads = await client.multicall({
        allowFailure: true,
        contracts: chunk.flatMap(vault => [
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'totalAssets' },
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'totalBorrows' },
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'cash' },
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'interestRate' },
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'interestFee' },
          { address: vault, abi: VAULT_STATE_ABI, functionName: 'maxDeposit', args: [MAX_DEPOSIT_RECEIVER] },
        ]),
      })

      chunk.forEach((vault, index) => {
        const base = index * 6
        if (!vault)
          return
        result[vault] = {
          totalAssets: reads[base]?.status === 'success' ? reads[base].result as bigint : undefined,
          totalBorrows: reads[base + 1]?.status === 'success' ? reads[base + 1].result as bigint : undefined,
          cash: reads[base + 2]?.status === 'success' ? reads[base + 2].result as bigint : undefined,
          interestRate: reads[base + 3]?.status === 'success' ? reads[base + 3].result as bigint : undefined,
          interestFee: reads[base + 4]?.status === 'success' ? BigInt(reads[base + 4].result as number) : undefined,
          maxDeposit: reads[base + 5]?.status === 'success' ? reads[base + 5].result as bigint : undefined,
        }
      })
    }
  }
  catch {
    return {}
  }

  return result
}

function normalizeVaults(
  vaults: EulerVaultRaw[],
  prices: Awaited<ReturnType<typeof fetchPriceMap>>,
  irmInfoMap: Awaited<ReturnType<typeof fetchIrmInfoMap>>,
  metadataMap: Awaited<ReturnType<typeof fetchMetadataMap>>,
  liveStateMap: Awaited<ReturnType<typeof fetchLiveVaultStateMap>>,
): EulerVaultExplorerData {
  const chain = EULER_CHAINS[0]
  const usedAsCollateralByAddress = new Map<string, `0x${string}`[]>()

  for (const vault of vaults) {
    for (const collateral of vault.collaterals ?? []) {
      const key = collateral.toLowerCase()
      const existing = usedAsCollateralByAddress.get(key) ?? []
      existing.push(asAddress(vault.id))
      usedAsCollateralByAddress.set(key, existing)
    }
  }

  let pricedAssetCount = 0

  const rows = vaults.map((vault): EulerVaultRow => {
    const assetAddress = vault.asset ? asAddress(vault.asset) : undefined
    const vaultAddress = asAddress(vault.id)
    const metadata = metadataMap[vaultAddress]
    const priceKey = assetAddress ? `${chain.defillamaSlug}:${assetAddress}` : ''
    const price = prices[priceKey]
    const fallbackDecimals = Number.parseInt(vault.decimals, 10)
    const decimals = price?.decimals ?? (Number.isFinite(fallbackDecimals) ? fallbackDecimals : 18)
    const assetSymbol = price?.symbol ?? fallbackAssetSymbol(vault.symbol)
    const liveState = liveStateMap[vaultAddress]
    const cash = liveState?.cash ?? parseBigint(vault.state?.cash)
    const totalBorrows = liveState?.totalBorrows ?? parseBigint(vault.state?.totalBorrows)
    const supplyCap = parseBigint(vault.supplyCap)
    const borrowCap = parseBigint(vault.borrowCap)
    const maxDeposit = liveState?.maxDeposit ?? (supplyCap > 0n ? 1n : 0n)
    const totalAssets = liveState?.totalAssets ?? cash + totalBorrows
    const tokenTotalAssets = numberFromBigint(totalAssets, decimals)
    const tokenCash = numberFromBigint(cash, decimals)
    const tokenBorrows = numberFromBigint(totalBorrows, decimals)
    const priceUsd = price?.price
    const perspectives = vault.perspectives ?? []
    const collateralAddresses = (vault.collaterals ?? []).map(asAddress)
    const interestRateModel = asAddress(vault.interestRateModel)
    const interestRateModelInfo = irmInfoMap[interestRateModel] ?? UNKNOWN_IRM_INFO

    if (priceUsd != null && Number.isFinite(priceUsd) && priceUsd > 0)
      pricedAssetCount += 1

    return {
      chainId: chain.chainId,
      chainName: chain.chainName,
      vaultAddress,
      name: vault.name,
      symbol: vault.symbol,
      assetAddress,
      assetSymbol,
      decimals,
      priceUsd,
      totalAssets,
      cash,
      totalBorrows,
      totalAssetsUsd: priceUsd != null ? tokenTotalAssets * priceUsd : undefined,
      cashUsd: priceUsd != null ? tokenCash * priceUsd : undefined,
      totalBorrowsUsd: priceUsd != null ? tokenBorrows * priceUsd : undefined,
      utilization: totalAssets > 0n ? tokenBorrows / tokenTotalAssets : 0,
      supplyApy: liveSupplyApy(liveState?.interestRate, totalAssets > 0n ? tokenBorrows / tokenTotalAssets : 0, liveState?.interestFee) ?? parseRay(vault.state?.supplyApy),
      borrowApy: liveBorrowApy(liveState?.interestRate) ?? parseRay(vault.state?.borrowApy),
      supplyCap,
      borrowCap,
      maxDeposit,
      isSupplyEnabled: maxDeposit > 0n,
      deprecated: metadata?.deprecated ?? false,
      governanceLimited: metadata?.governanceLimited ?? false,
      deprecationReason: metadata?.deprecationReason ?? null,
      marketName: metadata?.marketName ?? null,
      marketDescription: metadata?.description ?? null,
      portfolioNotice: metadata?.portfolioNotice ?? null,
      productId: metadata?.productId ?? null,
      entities: metadata?.entities ?? [],
      oracle: asAddress(vault.oracle),
      interestRateModel,
      interestRateModelType: interestRateModelInfo.type,
      interestRateModelLabel: interestRateModelInfo.label,
      creator: asAddress(vault.creator),
      governonAdmin: asAddress(vault.governonAdmin),
      collateralAddresses,
      acceptedCollaterals: [],
      usedAsCollateralBy: [],
      perspectives,
      perspectiveLabel: perspectiveLabel(perspectives),
      hasOracle: vault.oracle.toLowerCase() !== ZERO_ADDRESS,
    }
  })
  const rowByAddress = new Map(rows.map(row => [row.vaultAddress, row]))

  function relatedVault(address: `0x${string}`): EulerRelatedVault | undefined {
    const row = rowByAddress.get(address)
    if (!row)
      return undefined

    return {
      address: row.vaultAddress,
      symbol: row.symbol,
      assetSymbol: row.assetSymbol,
      utilization: row.utilization,
      isSupplyEnabled: row.isSupplyEnabled,
      totalAssetsUsd: row.totalAssetsUsd,
      cashUsd: row.cashUsd,
      supplyApy: row.supplyApy,
      deprecated: row.deprecated,
      governanceLimited: row.governanceLimited,
      deprecationReason: row.deprecationReason,
      marketName: row.marketName,
    }
  }

  for (const row of rows) {
    row.acceptedCollaterals = row.collateralAddresses
      .map(address => relatedVault(address))
      .filter((entry): entry is EulerRelatedVault => entry != null)
    row.usedAsCollateralBy = (usedAsCollateralByAddress.get(row.vaultAddress) ?? [])
      .map(address => relatedVault(address))
      .filter((entry): entry is EulerRelatedVault => entry != null)
  }

  return {
    rows,
    rawCount: vaults.length,
    pricedAssetCount,
    deprecatedCount: rows.filter(row => row.deprecated).length,
    governanceLimitedCount: rows.filter(row => row.governanceLimited).length,
    updatedAt: Date.now(),
  }
}

export function useEulerVaults() {
  return useQuery<EulerVaultExplorerData>({
    queryKey: ['euler-vaults', EULER_CHAINS.map(chain => chain.chainId)],
    queryFn: async () => {
      const vaults = await fetchAllVaults()
      const [prices, irmInfoMap, metadataMap, liveStateMap] = await Promise.all([
        fetchPriceMap(vaults),
        fetchIrmInfoMap(vaults),
        fetchMetadataMap(),
        fetchLiveVaultStateMap(vaults),
      ])
      return normalizeVaults(vaults, prices, irmInfoMap, metadataMap, liveStateMap)
    },
    staleTime: 5 * 60 * 1000,
  })
}
