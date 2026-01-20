export function minBigint(a: bigint, b: bigint): bigint {
  return a <= b ? a : b
}

export function max0(x: bigint): bigint {
  return x > 0n ? x : 0n
}

export function normalizeId(id: `0x${string}`): string {
  return id.toLowerCase()
}

export function sumBigints(values: readonly bigint[]): bigint {
  let s = 0n
  for (const v of values)
    s += v
  return s
}

export function addDepositProRata(currentUser: readonly bigint[], newDepositAssets: bigint): bigint[] {
  const deposit = newDepositAssets > 0n ? newDepositAssets : 0n
  if (deposit === 0n)
    return [...currentUser]

  const total = sumBigints(currentUser)
  if (total <= 0n)
    return [...currentUser]

  // Distribute floor(proportion) first, then allocate remaining 1-wei units by largest remainder.
  const extra: bigint[] = Array.from({ length: currentUser.length }, () => 0n)
  const remainders: Array<{ idx: number, rem: bigint }> = []
  let distributed = 0n

  for (let i = 0; i < currentUser.length; i++) {
    const u = currentUser[i]
    if (u <= 0n) {
      remainders.push({ idx: i, rem: 0n })
      continue
    }
    const numer = deposit * u
    const q = numer / total
    const r = numer % total
    extra[i] = q
    distributed += q
    remainders.push({ idx: i, rem: r })
  }

  let leftover = deposit - distributed
  if (leftover > 0n) {
    remainders.sort((a, b) => (a.rem === b.rem ? 0 : (a.rem > b.rem ? -1 : 1)))
    for (let k = 0; k < remainders.length && leftover > 0n; k++) {
      extra[remainders[k].idx] += 1n
      leftover -= 1n
    }
  }

  const out: bigint[] = Array.from({ length: currentUser.length }, (_, i) => currentUser[i] + extra[i])
  return out
}

export function getPerMarketCap<T>(
  market: T,
  constraints?: {
    perMarketCapAssets?: bigint
    perMarketCapAssetsByMarket?: (m: T) => bigint | undefined
  },
): bigint | undefined {
  const byMarket = constraints?.perMarketCapAssetsByMarket?.(market)
  if (byMarket != null)
    return byMarket
  return constraints?.perMarketCapAssets
}
