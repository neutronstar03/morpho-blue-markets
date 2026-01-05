import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createPublicClient } from 'viem'
import { mainnet } from 'viem/chains'
import { ADAPTIVE_CURVE_IRM_ABI, MORPHO_BLUE_ABI, MORPHO_BLUE_MAINNET } from '../irm/abi'
import { makeMainnetTransport } from '../irm/rpc'

const BLOCK_NUMBER = 24164776n

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')

interface GqlMarketMin {
  uniqueKey: string
  irmAddress: string
}

interface Position01Entry {
  market: { uniqueKey: string }
}

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as T
}

function stringifyBigint(x: bigint): string {
  return x.toString(10)
}

function safeLower(x: string) {
  return x.toLowerCase()
}

function dedupeByUniqueKey(markets: GqlMarketMin[]): GqlMarketMin[] {
  const map = new Map<string, GqlMarketMin>()
  for (const m of markets) {
    const key = safeLower(m.uniqueKey)
    if (!map.has(key))
      map.set(key, m)
  }
  return [...map.values()]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size)
    out.push(arr.slice(i, i + size))
  return out
}

function isLikelyArchiveError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('missing trie node')
    || msg.includes('header not found')
    || msg.includes('unknown block')
    || msg.includes('cannot query unfinalized data')
    || msg.includes('historical state')
    || msg.includes('does not have state')
    || msg.includes('pruned')
}

async function main() {
  const marketsPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'markets', `usds-mainnet-${BLOCK_NUMBER}.json`)
  const positionsPath = path.join(REPO_ROOT, 'tests', 'fixtures', 'positions', 'position01.json')
  const outDir = path.join(REPO_ROOT, 'tests', 'fixtures', 'rpc')
  const outPath = path.join(outDir, `usds-mainnet-${BLOCK_NUMBER}-onchain.json`)

  const marketsAll = readJson<GqlMarketMin[]>(marketsPath)
  const markets = dedupeByUniqueKey(marketsAll)

  const positionsRaw = readJson<Position01Entry[]>(positionsPath)
  const requiredMarketIds = new Set(positionsRaw.map(p => safeLower(p.market.uniqueKey)))

  const client = createPublicClient({
    chain: mainnet,
    transport: makeMainnetTransport(),
  })

  let timestamp: bigint
  try {
    const block = await client.getBlock({ blockNumber: BLOCK_NUMBER })
    timestamp = block.timestamp
  }
  catch (err) {
    console.error(`Failed to fetch block ${BLOCK_NUMBER} header/timestamp.`)
    if (isLikelyArchiveError(err)) {
      console.error('This RPC likely cannot serve historical blocks. Try setting MAINNET_RPC_URL to an archive-capable endpoint (just once to generate the fixture).')
    }
    throw err
  }

  const contracts = markets.flatMap((m) => {
    const id = m.uniqueKey as `0x${string}`
    return [
      {
        address: MORPHO_BLUE_MAINNET,
        abi: MORPHO_BLUE_ABI,
        functionName: 'market',
        args: [id] as const,
      },
      {
        address: m.irmAddress as `0x${string}`,
        abi: ADAPTIVE_CURVE_IRM_ABI,
        functionName: 'rateAtTarget',
        args: [id] as const,
      },
    ] as const
  })

  const results: Array<{ status: 'success' | 'failure', result?: unknown, error?: unknown }> = []
  for (const c of chunk(contracts, 200)) {
    const chunkRes = await client.multicall({
      allowFailure: true,
      contracts: c as any,
      blockNumber: BLOCK_NUMBER,
    })
    results.push(...(chunkRes as any))
  }

  const outMarkets: Array<{
    marketId: `0x${string}`
    totalSupplyAssets: string
    totalSupplyShares: string
    totalBorrowAssets: string
    totalBorrowShares: string
    lastUpdate: string
    feeWad: string
    rateAtTarget: string
  }> = []

  const missingRequired: string[] = []

  for (let i = 0; i < markets.length; i++) {
    const id = markets[i].uniqueKey as `0x${string}`
    const marketRes = results[2 * i]
    const rateRes = results[2 * i + 1]
    const required = requiredMarketIds.has(safeLower(id))

    if (marketRes?.status !== 'success' || rateRes?.status !== 'success') {
      if (required)
        missingRequired.push(id)
      continue
    }

    const tuple = marketRes.result as any
    // viem may return array tuple or named object; support both.
    const totalSupplyAssets = (Array.isArray(tuple) ? tuple[0] : tuple.totalSupplyAssets) as bigint
    const totalSupplyShares = (Array.isArray(tuple) ? tuple[1] : tuple.totalSupplyShares) as bigint
    const totalBorrowAssets = (Array.isArray(tuple) ? tuple[2] : tuple.totalBorrowAssets) as bigint
    const totalBorrowShares = (Array.isArray(tuple) ? tuple[3] : tuple.totalBorrowShares) as bigint
    const lastUpdate = (Array.isArray(tuple) ? tuple[4] : tuple.lastUpdate) as bigint
    const fee = (Array.isArray(tuple) ? tuple[5] : tuple.fee) as bigint
    const rateAtTarget = rateRes.result as bigint

    outMarkets.push({
      marketId: id,
      totalSupplyAssets: stringifyBigint(totalSupplyAssets),
      totalSupplyShares: stringifyBigint(totalSupplyShares),
      totalBorrowAssets: stringifyBigint(totalBorrowAssets),
      totalBorrowShares: stringifyBigint(totalBorrowShares),
      lastUpdate: stringifyBigint(lastUpdate),
      feeWad: stringifyBigint(fee),
      rateAtTarget: stringifyBigint(rateAtTarget),
    })
  }

  if (missingRequired.length > 0) {
    console.error(`Missing onchain data for ${missingRequired.length} required position markets at block ${BLOCK_NUMBER}.`)
    console.error('This is usually because the RPC is not archive-capable for old state.')
    console.error('Set MAINNET_RPC_URL (or RPC_URL) to an archive endpoint just for this script, then re-run.')
    console.error(`Required marketIds missing: ${missingRequired.join(', ')}`)
    process.exitCode = 2
    return
  }

  outMarkets.sort((a, b) => safeLower(a.marketId).localeCompare(safeLower(b.marketId)))

  const payload = {
    chainId: 1,
    blockNumber: stringifyBigint(BLOCK_NUMBER),
    timestamp: stringifyBigint(timestamp),
    morphoBlue: MORPHO_BLUE_MAINNET,
    markets: outMarkets,
    meta: {
      generatedAt: new Date().toISOString(),
      env: {
        MAINNET_RPC_URL: process.env.MAINNET_RPC_URL ? 'set' : 'unset',
        RPC_URL: process.env.RPC_URL ? 'set' : 'unset',
      },
    },
  } as const

  if (!fs.existsSync(outDir))
    fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  console.warn(`Wrote onchain snapshot fixture: ${outPath}`)
  console.warn(`Markets (deduped): ${markets.length}, recorded: ${outMarkets.length}`)
  console.warn(`Pinned block: ${BLOCK_NUMBER} (timestamp=${timestamp})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
