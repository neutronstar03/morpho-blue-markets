import { bound, WAD, wDivDown, wDivToZero, wMulToZero } from './fixed-point'

// ConstantsLib.sol (exact integer math, scaled by WAD)
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

const CURVE_STEEPNESS = 4n * WAD
const ADJUSTMENT_SPEED = (50n * WAD) / SECONDS_PER_YEAR
const TARGET_UTILIZATION = 900_000_000_000_000_000n // 0.9 ether
const INITIAL_RATE_AT_TARGET = 40_000_000_000_000_000n / SECONDS_PER_YEAR // 0.04 ether / year
const MIN_RATE_AT_TARGET = 1_000_000_000_000_000n / SECONDS_PER_YEAR // 0.001 ether / year
const MAX_RATE_AT_TARGET = (2n * WAD) / SECONDS_PER_YEAR // 2.0 ether / year

// ExpLib.sol constants (scaled by WAD)
const LN_2_INT = 693_147_180_559_945_309n
const LN_WEI_INT = -41_446_531_673_892_822_312n
const WEXP_UPPER_BOUND = 93_859_467_695_000_404_319n
const WEXP_UPPER_VALUE = 57_716_089_161_558_943_949_701_069_502_944_508_345_128_422_502_756_744_429_568n

export interface AdaptiveCurveMarket {
  totalSupplyAssets: bigint
  totalBorrowAssets: bigint
  lastUpdate: bigint
}

/**
 * Local TS port of AdaptiveCurveIrm.borrowRateView (avg borrow rate per second, WAD-scaled).
 *
 * - `rateAtTarget` is the onchain `rateAtTarget[id]` (int256).
 * - `timestamp` must be the block timestamp for the same blockNumber used for onchain calls.
 */
export function adaptiveCurveBorrowRateView(args: {
  marketId: `0x${string}`
  rateAtTarget: bigint
  market: AdaptiveCurveMarket
  timestamp: bigint
}): bigint {
  const { rateAtTarget, market, timestamp } = args

  const [avgRate] = borrowRate(rateAtTarget, market, timestamp)
  return avgRate
}

function borrowRate(
  startRateAtTarget: bigint,
  market: AdaptiveCurveMarket,
  timestamp: bigint,
): [bigint, bigint] {
  // utilization = totalBorrowAssets / totalSupplyAssets (WAD), rounded down.
  const utilization = market.totalSupplyAssets > 0n
    ? BigInt(wDivDown(market.totalBorrowAssets, market.totalSupplyAssets))
    : 0n

  const errNormFactor = utilization > TARGET_UTILIZATION
    ? WAD - TARGET_UTILIZATION
    : TARGET_UTILIZATION

  const err = wDivToZero(utilization - TARGET_UTILIZATION, errNormFactor)

  let avgRateAtTarget: bigint
  let endRateAtTarget: bigint

  if (startRateAtTarget === 0n) {
    // First interaction.
    avgRateAtTarget = INITIAL_RATE_AT_TARGET
    endRateAtTarget = INITIAL_RATE_AT_TARGET
  }
  else {
    const speed = wMulToZero(ADJUSTMENT_SPEED, err)
    const elapsed = BigInt(timestamp - market.lastUpdate)
    const linearAdaptation = speed * elapsed

    if (linearAdaptation === 0n) {
      avgRateAtTarget = startRateAtTarget
      endRateAtTarget = startRateAtTarget
    }
    else {
      endRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation)
      const midRateAtTarget = newRateAtTarget(startRateAtTarget, linearAdaptation / 2n)
      avgRateAtTarget = (startRateAtTarget + endRateAtTarget + 2n * midRateAtTarget) / 4n
    }
  }

  const avgRate = curve(avgRateAtTarget, err)
  return [avgRate, endRateAtTarget]
}

function curve(_rateAtTarget: bigint, err: bigint): bigint {
  const coeff = err < 0n
    ? WAD - wDivToZero(WAD, CURVE_STEEPNESS)
    : CURVE_STEEPNESS - WAD
  return wMulToZero(wMulToZero(coeff, err) + WAD, _rateAtTarget)
}

function newRateAtTarget(startRateAtTarget: bigint, linearAdaptation: bigint): bigint {
  const next = wMulToZero(startRateAtTarget, wExp(linearAdaptation))
  return bound(next, MIN_RATE_AT_TARGET, MAX_RATE_AT_TARGET)
}

// ExpLib.wExp (2nd-order Taylor on the remainder, plus power-of-two scaling)
function wExp(x: bigint): bigint {
  // If x < ln(1e-18) then exp(x) < 1e-18 so it is rounded to zero.
  if (x < LN_WEI_INT)
    return 0n
  // Clip to avoid overflowing when multiplied with 1 ether.
  if (x >= WEXP_UPPER_BOUND)
    return WEXP_UPPER_VALUE

  // Decompose x = q*ln(2) + r, with q integer and -ln(2)/2 <= r <= ln(2)/2.
  const roundingAdjustment = x < 0n ? -(LN_2_INT / 2n) : (LN_2_INT / 2n)
  const q = (x + roundingAdjustment) / LN_2_INT
  const r = x - q * LN_2_INT

  // exp(r) ~= 1 + r + r^2/2
  const expR = WAD + r + ((r * r) / WAD) / 2n

  // e^x = 2^q * e^r
  if (q >= 0n)
    return expR << q
  return expR >> (-q)
}
