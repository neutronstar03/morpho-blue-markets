import type { MorphoMarketState } from './market-state'
import { adaptiveCurveBorrowRateView } from '~/lib/irm/adaptive-curve-irm'
import { clampRatePerSecondWad, WAD } from '~/lib/irm/apy-math'
import { toMorphoSharesDown } from './share-math'

function wTaylorCompounded(ratePerSecondWad: bigint, elapsedSeconds: bigint): bigint {
  if (ratePerSecondWad <= 0n || elapsedSeconds <= 0n)
    return 0n

  // Morpho accrues interest with a Taylor approximation of e^(rate * elapsed) - 1.
  const x = ratePerSecondWad * elapsedSeconds
  const x2 = (x * x) / WAD
  const x3 = (x2 * x) / WAD
  return x + x2 / 2n + x3 / 6n
}

export function projectMorphoMarketAccrual(args: {
  marketId: `0x${string}`
  market: MorphoMarketState
  rateAtTarget: bigint
  timestamp: bigint
}): MorphoMarketState {
  const { market, marketId, rateAtTarget, timestamp } = args

  if (timestamp <= market.lastUpdate || market.totalBorrowAssets <= 0n || market.totalSupplyAssets <= 0n)
    return market

  const borrowRatePerSecondWad = clampRatePerSecondWad(adaptiveCurveBorrowRateView({
    marketId,
    rateAtTarget,
    market: {
      totalSupplyAssets: market.totalSupplyAssets,
      totalBorrowAssets: market.totalBorrowAssets,
      lastUpdate: market.lastUpdate,
    },
    timestamp,
  }))

  const elapsedSeconds = timestamp - market.lastUpdate
  const interestFactorWad = wTaylorCompounded(borrowRatePerSecondWad, elapsedSeconds)
  const interest = (market.totalBorrowAssets * interestFactorWad) / WAD

  if (interest <= 0n)
    return market

  const projectedTotalBorrowAssets = market.totalBorrowAssets + interest
  const projectedTotalSupplyAssets = market.totalSupplyAssets + interest

  const feeAmount = (interest * market.fee) / WAD
  const feeShares = feeAmount > 0n && projectedTotalSupplyAssets > feeAmount
    ? toMorphoSharesDown(feeAmount, projectedTotalSupplyAssets - feeAmount, market.totalSupplyShares)
    : 0n
  return {
    ...market,
    totalSupplyAssets: projectedTotalSupplyAssets,
    totalSupplyShares: market.totalSupplyShares + feeShares,
    totalBorrowAssets: projectedTotalBorrowAssets,
    lastUpdate: timestamp,
  }
}
