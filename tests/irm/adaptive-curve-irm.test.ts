import { describe, expect, test } from 'bun:test'
import { createPublicClient, formatUnits } from 'viem'
import { mainnet } from 'viem/chains'
import { adaptiveCurveBorrowRateView } from '../../app/lib/irm/adaptive-curve-irm'
import { displayApyFromRatePerSecondWad, supplyRatePerSecondWad, wadDivDown } from '../../app/lib/irm/apy-math'
import { ADAPTIVE_CURVE_IRM_ABI, MORPHO_BLUE_ABI, MORPHO_BLUE_MAINNET } from './abi'
import { makeMainnetTransport } from './rpc'

const MARKET_IDS = [
  '0x0655e0c8686d94d9e0c0d2b78d7f99492676e52d712db5ac061b3c78da4b7587',
  '0x973b23002efe233943715a2dfb98b66a0434d4b192b00bb4924230b3916433f7',
  '0x44f51e6b7356132597872e40c8d4a5bb2f1fc2c99e7292ee3b3953d9074086b6',
] as const satisfies readonly `0x${string}`[]

function absDiff(a: bigint, b: bigint) {
  return a >= b ? (a - b) : (b - a)
}

function uniqBigints(values: bigint[]) {
  return Array.from(new Set(values.map(v => v.toString()))).map(v => BigInt(v))
}

const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n
const WAD = 1_000_000_000_000_000_000n

function aprWadFromRatePerSecondWad(ratePerSecondWad: bigint) {
  // Poor-man APR: ignores compounding, treats the instantaneous per-second rate as constant for a year.
  return ratePerSecondWad * SECONDS_PER_YEAR
}

function apyFromRatePerSecondWad(ratePerSecondWad: bigint) {
  // Continuous-compounding style APY (matches `useMarketPreview` convention).
  const r = Number.parseFloat(formatUnits(ratePerSecondWad, 18))
  if (!Number.isFinite(r) || r <= 0)
    return 0
  return Math.expm1(r * Number(SECONDS_PER_YEAR))
}

function utilizationWad(totalBorrowAssets: bigint, totalSupplyAssets: bigint) {
  if (totalSupplyAssets <= 0n)
    return 0n
  return (totalBorrowAssets * WAD) / totalSupplyAssets
}

const ERC20_META_ABI = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

function normalizeMarketParams(x: any) {
  // viem may return either an object with named props or a tuple array.
  if (Array.isArray(x)) {
    return {
      loanToken: x[0] as `0x${string}`,
      collateralToken: x[1] as `0x${string}`,
      oracle: x[2] as `0x${string}`,
      irm: x[3] as `0x${string}`,
      lltv: x[4] as bigint,
    }
  }
  return x as {
    loanToken: `0x${string}`
    collateralToken: `0x${string}`
    oracle: `0x${string}`
    irm: `0x${string}`
    lltv: bigint
  }
}

function normalizeMarket(x: any) {
  if (Array.isArray(x)) {
    return {
      totalSupplyAssets: x[0] as bigint,
      totalSupplyShares: x[1] as bigint,
      totalBorrowAssets: x[2] as bigint,
      totalBorrowShares: x[3] as bigint,
      lastUpdate: x[4] as bigint,
      fee: x[5] as bigint,
    }
  }
  return x as {
    totalSupplyAssets: bigint
    totalSupplyShares: bigint
    totalBorrowAssets: bigint
    totalBorrowShares: bigint
    lastUpdate: bigint
    fee: bigint
  }
}

describe('IRM diff harness (block-pinned reads)', () => {
  test('local AdaptiveCurveIRM matches onchain borrowRateView (latest block pinned)', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    // We intentionally run everything against a *single* block to make the comparison deterministic.
    // If a new block arrives mid-test, we warn, but we still compare using this pinned `startBlockNumber`.
    const startBlockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber: startBlockNumber })
    // IMPORTANT: AdaptiveCurveIRM uses `block.timestamp` in the view math, so local must use the same timestamp.
    const timestamp = block.timestamp

    // `borrowRateView` returns a per-second borrow rate scaled by 1e18 (WAD).
    // We aim for strict equality (diff === 0).
    const MAX_ABS_DIFF = 0n
    let worst: { id: string, delta: bigint, onchain: bigint, local: bigint, diff: bigint } | undefined

    for (const id of MARKET_IDS) {
      // 1) Read market inputs from Morpho at the pinned block:
      //    - marketParams: tells us which IRM contract to call (marketParams.irm)
      //    - market: totals + lastUpdate that the IRM view function needs
      const marketParamsRaw = await client.readContract({
        address: MORPHO_BLUE_MAINNET,
        abi: MORPHO_BLUE_ABI,
        functionName: 'idToMarketParams',
        args: [id],
        blockNumber: startBlockNumber,
      })

      const marketRaw = await client.readContract({
        address: MORPHO_BLUE_MAINNET,
        abi: MORPHO_BLUE_ABI,
        functionName: 'market',
        args: [id],
        blockNumber: startBlockNumber,
      })

      const marketParams = normalizeMarketParams(marketParamsRaw)
      const market = normalizeMarket(marketRaw)

      // 2) Read IRM storage that affects the view output:
      //    AdaptiveCurveIRM maintains a per-market `rateAtTarget[id]` that is part of the formula.
      const rateAtTarget = await client.readContract({
        address: marketParams.irm,
        abi: ADAPTIVE_CURVE_IRM_ABI,
        functionName: 'rateAtTarget',
        args: [id],
        blockNumber: startBlockNumber,
      })

      expect(marketParams.irm).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(market.totalSupplyAssets).toBeTypeOf('bigint')
      expect(market.totalBorrowAssets).toBeTypeOf('bigint')
      expect(market.lastUpdate).toBeTypeOf('bigint')
      expect(rateAtTarget).toBeTypeOf('bigint')

      // Basic sanity: timestamp should be >= lastUpdate for initialized markets.
      expect(timestamp >= market.lastUpdate).toBe(true)

      const baseSupply = market.totalSupplyAssets

      // 3) Simulate "deposits" by increasing totalSupplyAssets (in raw asset units).
      //    This changes utilization u = borrow/supply, which changes the borrow rate.
      //    Note: we do *not* send transactions — we just pass a modified `market` struct to borrowRateView.
      const deltas = uniqBigints([
        0n,
        baseSupply / 1_000n,
        baseSupply / 100n,
        baseSupply / 10n,
        baseSupply,
      ]).filter(d => d >= 0n)

      for (const delta of deltas) {
        const marketSim = {
          ...market,
          totalSupplyAssets: baseSupply + delta,
        } as const

        // Onchain oracle: IRM's real borrowRateView for these exact inputs (at the pinned block).
        const onchainRatePerSecondWad = await client.readContract({
          address: marketParams.irm,
          abi: ADAPTIVE_CURVE_IRM_ABI,
          functionName: 'borrowRateView',
          args: [marketParams, marketSim],
          blockNumber: startBlockNumber,
        })

        // Local model: TS port of AdaptiveCurveIRM, computed from the same inputs.
        // We pass `rateAtTarget` explicitly since in Solidity it's read from IRM storage.
        const localRatePerSecondWad = adaptiveCurveBorrowRateView({
          marketId: id,
          rateAtTarget,
          market: {
            totalSupplyAssets: marketSim.totalSupplyAssets,
            totalBorrowAssets: marketSim.totalBorrowAssets,
            lastUpdate: marketSim.lastUpdate,
          },
          timestamp,
        })

        // 4) Compare local vs onchain.
        const diff = absDiff(localRatePerSecondWad, onchainRatePerSecondWad)
        if (!worst || diff > worst.diff)
          worst = { id, delta, onchain: onchainRatePerSecondWad, local: localRatePerSecondWad, diff }

        // If you ever see this fail, it means the TS port drifted from onchain math/rounding.
        expect(diff).toBeLessThanOrEqual(MAX_ABS_DIFF)
      }
    }

    if (worst && worst.diff > 0n) {
      console.warn(`Worst diff: id=${worst.id} delta=${worst.delta} local=${worst.local} onchain=${worst.onchain} diff=${worst.diff}`)
    }

    const endBlockNumber = await client.getBlockNumber()
    if (endBlockNumber !== startBlockNumber) {
      // Warn, but do not fail: all reads were pinned to startBlockNumber.

      console.warn(`Warning: head moved during test (${startBlockNumber} -> ${endBlockNumber}). Assertions still use ${startBlockNumber}.`)
    }
  }, { timeout: 60_000 })
})

describe('IRM explanation (poor-man APR estimator)', () => {
  test('display APY is APR-only for monotonic preview', () => {
    const borrowBefore = 157_587_248_936n
    const borrowAfter = 81_347_261_336n
    const utilBeforeWad = 1_000_000_000_000_000_000n
    const utilAfterWad = 935_655_477_754_847_575n
    const feeWad = 0n

    const supplyRateBefore = supplyRatePerSecondWad({
      borrowRatePerSecondWad: borrowBefore,
      utilizationWad: utilBeforeWad,
      feeWad,
    })
    const supplyRateAfter = supplyRatePerSecondWad({
      borrowRatePerSecondWad: borrowAfter,
      utilizationWad: utilAfterWad,
      feeWad,
    })

    const apyBefore = displayApyFromRatePerSecondWad(supplyRateBefore)
    const apyAfter = displayApyFromRatePerSecondWad(supplyRateAfter)

    expect(apyAfter).toBeLessThan(apyBefore)
    expect(supplyRateAfter).toBeLessThan(supplyRateBefore)
  })

  test('logs borrow APR before/after a +1% supply “deposit”', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    const id = MARKET_IDS[0]

    const startBlockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber: startBlockNumber })
    const timestamp = block.timestamp

    const marketParams = normalizeMarketParams(await client.readContract({
      address: MORPHO_BLUE_MAINNET,
      abi: MORPHO_BLUE_ABI,
      functionName: 'idToMarketParams',
      args: [id],
      blockNumber: startBlockNumber,
    }))

    const market = normalizeMarket(await client.readContract({
      address: MORPHO_BLUE_MAINNET,
      abi: MORPHO_BLUE_ABI,
      functionName: 'market',
      args: [id],
      blockNumber: startBlockNumber,
    }))

    // “Deposit” simulation: bump totalSupplyAssets by 1% (raw loan token units).
    const depositDelta = market.totalSupplyAssets / 100n
    const marketAfterDeposit = { ...market, totalSupplyAssets: market.totalSupplyAssets + depositDelta } as const

    // Onchain oracle rates (per-second, WAD).
    const onchainBefore = await client.readContract({
      address: marketParams.irm,
      abi: ADAPTIVE_CURVE_IRM_ABI,
      functionName: 'borrowRateView',
      args: [marketParams, market],
      blockNumber: startBlockNumber,
    })

    const onchainAfter = await client.readContract({
      address: marketParams.irm,
      abi: ADAPTIVE_CURVE_IRM_ABI,
      functionName: 'borrowRateView',
      args: [marketParams, marketAfterDeposit],
      blockNumber: startBlockNumber,
    })

    // Local model (same inputs) — included just to show they match.
    const rateAtTarget = await client.readContract({
      address: marketParams.irm,
      abi: ADAPTIVE_CURVE_IRM_ABI,
      functionName: 'rateAtTarget',
      args: [id],
      blockNumber: startBlockNumber,
    })

    const localAfter = adaptiveCurveBorrowRateView({
      marketId: id,
      rateAtTarget,
      market: {
        totalSupplyAssets: marketAfterDeposit.totalSupplyAssets,
        totalBorrowAssets: marketAfterDeposit.totalBorrowAssets,
        lastUpdate: marketAfterDeposit.lastUpdate,
      },
      timestamp,
    })

    // Token metadata just for human-readable logs.
    const loanToken = marketParams.loanToken as `0x${string}`
    let decimals = 18
    let symbol = 'TOKEN'
    try {
      decimals = Number(await client.readContract({
        address: loanToken,
        abi: ERC20_META_ABI,
        functionName: 'decimals',
        blockNumber: startBlockNumber,
      }))
    }
    catch {}
    try {
      symbol = await client.readContract({
        address: loanToken,
        abi: ERC20_META_ABI,
        functionName: 'symbol',
        blockNumber: startBlockNumber,
      })
    }
    catch {}

    const supplyBeforeTokens = formatUnits(market.totalSupplyAssets, decimals)
    const depositDeltaTokens = formatUnits(depositDelta, decimals)

    const aprBefore = aprWadFromRatePerSecondWad(onchainBefore)
    const aprAfter = aprWadFromRatePerSecondWad(onchainAfter)

    const aprBeforePct = Number.parseFloat(formatUnits((aprBefore * 100n) / WAD, 0)) // integer percent, coarse
    const aprAfterPct = Number.parseFloat(formatUnits((aprAfter * 100n) / WAD, 0))

    console.warn(`Market id: ${id}`)
    console.warn(`Pinned block: ${startBlockNumber} (timestamp=${timestamp})`)
    console.warn(`Loan token: ${loanToken} (${symbol}, decimals=${decimals})`)
    console.warn(`totalSupplyAssets(before): ${supplyBeforeTokens} ${symbol}`)
    console.warn(`deposit(+1% supply):       ${depositDeltaTokens} ${symbol}`)
    console.warn(`borrowRateView(before):    ${onchainBefore} (per-second WAD)`)
    console.warn(`borrowRateView(after):     ${onchainAfter} (per-second WAD)`)
    console.warn(`APR(before) ~ ${(aprBeforePct)}% (poor-man, no compounding)`)
    console.warn(`APR(after)  ~ ${(aprAfterPct)}% (poor-man, no compounding)`)

    // The point of this test is explanatory logging; keep one light assertion so it still “tests” something.
    expect(absDiff(localAfter, onchainAfter)).toBe(0n)
  }, { timeout: 60_000 })

  test('PEPE/USDS spot check: print borrow/supply APR vs APY at optimizer-sized deposit', async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: makeMainnetTransport(),
    })

    // Market from optimizer output.
    const id = '0x5ffdf15c5a4d7c6affb3f12634eeda1a20e60b92c0eb547f61754f656b55841e' as const
    // Optimizer allocation from the earlier run (raw USDS units, 18 decimals).
    const depositDelta = 77_000n * 10n ** 18n

    const startBlockNumber = await client.getBlockNumber()
    const block = await client.getBlock({ blockNumber: startBlockNumber })
    const timestamp = block.timestamp

    const marketParams = normalizeMarketParams(await client.readContract({
      address: MORPHO_BLUE_MAINNET,
      abi: MORPHO_BLUE_ABI,
      functionName: 'idToMarketParams',
      args: [id],
      blockNumber: startBlockNumber,
    }))

    const market = normalizeMarket(await client.readContract({
      address: MORPHO_BLUE_MAINNET,
      abi: MORPHO_BLUE_ABI,
      functionName: 'market',
      args: [id],
      blockNumber: startBlockNumber,
    }))

    const marketAfterDeposit = { ...market, totalSupplyAssets: market.totalSupplyAssets + depositDelta } as const

    const onchainBorrowRatePerSecondWad = await client.readContract({
      address: marketParams.irm,
      abi: ADAPTIVE_CURVE_IRM_ABI,
      functionName: 'borrowRateView',
      args: [marketParams, marketAfterDeposit],
      blockNumber: startBlockNumber,
    })

    const rateAtTarget = await client.readContract({
      address: marketParams.irm,
      abi: ADAPTIVE_CURVE_IRM_ABI,
      functionName: 'rateAtTarget',
      args: [id],
      blockNumber: startBlockNumber,
    })

    const localBorrowRatePerSecondWad = adaptiveCurveBorrowRateView({
      marketId: id,
      rateAtTarget,
      market: {
        totalSupplyAssets: marketAfterDeposit.totalSupplyAssets,
        totalBorrowAssets: marketAfterDeposit.totalBorrowAssets,
        lastUpdate: marketAfterDeposit.lastUpdate,
      },
      timestamp,
    })

    // Assert our local model matches onchain borrowRateView for this input.
    expect(absDiff(localBorrowRatePerSecondWad, onchainBorrowRatePerSecondWad)).toBe(0n)

    const utilAfterWad = utilizationWad(marketAfterDeposit.totalBorrowAssets, marketAfterDeposit.totalSupplyAssets)
    const utilAfter = Number.parseFloat(formatUnits(utilAfterWad, 18))

    const fee = Number.parseFloat(formatUnits(marketAfterDeposit.fee, 18))

    const borrowApr = Number.parseFloat(formatUnits(aprWadFromRatePerSecondWad(onchainBorrowRatePerSecondWad), 18))
    const borrowApy = apyFromRatePerSecondWad(onchainBorrowRatePerSecondWad)

    const supplyAprGross = borrowApr * utilAfter
    const supplyAprNet = supplyAprGross * (1 - fee)

    const supplyApyGross = borrowApy * utilAfter
    const supplyApyNet = supplyApyGross * (1 - fee)

    console.warn('')
    console.warn('=== PEPE/USDS spot check (borrowRateView @ pinned block, after deposit) ===')
    console.warn(`Market id:        ${id}`)
    console.warn(`Pinned block:     ${startBlockNumber} (timestamp=${timestamp})`)
    console.warn(`Deposit delta:    ${formatUnits(depositDelta, 18)} USDS`)
    console.warn(`Utilization(after): ${(utilAfter * 100).toFixed(2)}%`)
    console.warn(`Fee:               ${(fee * 100).toFixed(2)}%`)
    console.warn(`Borrow APR(simple): ${(borrowApr * 100).toFixed(2)}%`)
    console.warn(`Borrow APY(comp):  ${(borrowApy * 100).toFixed(2)}%`)
    console.warn(`Supply APR gross:  ${(supplyAprGross * 100).toFixed(2)}%`)
    console.warn(`Supply APR net:    ${(supplyAprNet * 100).toFixed(2)}%`)
    console.warn(`Supply APY gross:  ${(supplyApyGross * 100).toFixed(2)}%`)
    console.warn(`Supply APY net:    ${(supplyApyNet * 100).toFixed(2)}%`)
    console.warn('======================================================================')
    console.warn('')
  }, { timeout: 60_000 })
})
