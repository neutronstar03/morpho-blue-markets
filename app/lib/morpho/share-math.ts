const VIRTUAL_SHARES = 1_000_000n
const VIRTUAL_ASSETS = 1n

function mulDivDown(a: bigint, b: bigint, denominator: bigint): bigint {
  if (a <= 0n || b <= 0n || denominator <= 0n)
    return 0n
  return (a * b) / denominator
}

function mulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  if (a <= 0n || b <= 0n || denominator <= 0n)
    return 0n
  return ((a * b) + denominator - 1n) / denominator
}

export function toMorphoSharesDown(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDivDown(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS)
}

export function toMorphoSharesUp(assets: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDivUp(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS)
}

export function toMorphoAssetsDown(shares: bigint, totalAssets: bigint, totalShares: bigint): bigint {
  return mulDivDown(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES)
}
