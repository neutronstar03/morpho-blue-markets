export const WAD = 1_000_000_000_000_000_000n

/** Signed fixed-point multiply (WAD), rounded toward zero. */
export function wMulToZero(x: bigint, y: bigint): bigint {
  return (x * y) / WAD
}

/** Signed fixed-point divide (WAD), rounded toward zero. */
export function wDivToZero(x: bigint, y: bigint): bigint {
  return (x * WAD) / y
}

/** Unsigned fixed-point divide (WAD), rounded down (floor). Inputs must be >= 0. */
export function wDivDown(x: bigint, y: bigint): bigint {
  if (y === 0n)
    throw new Error('wDivDown division by zero')
  if (x < 0n || y < 0n)
    throw new Error('wDivDown expects unsigned inputs')
  return (x * WAD) / y
}

/** Clamp x into [low, high]. If low > high, returns low (matches UtilsLib comment). */
export function bound(x: bigint, low: bigint, high: bigint): bigint {
  if (low > high)
    return low
  if (x > high)
    return high
  if (x < low)
    return low
  return x
}
