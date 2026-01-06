export interface MorphoMarketState {
  totalSupplyAssets: bigint
  totalSupplyShares: bigint
  totalBorrowAssets: bigint
  totalBorrowShares: bigint
  lastUpdate: bigint
  fee: bigint
}

/**
 * Morpho `market(bytes32 id)` returns a 6-tuple onchain.
 * Depending on viem/wagmi settings it can come back as:
 * - an array (tuple)
 * - an object with named fields
 */
export function normalizeMorphoMarketState(x: unknown): MorphoMarketState | undefined {
  if (!x)
    return undefined

  if (Array.isArray(x) && x.length >= 6) {
    return {
      totalSupplyAssets: x[0] as bigint,
      totalSupplyShares: x[1] as bigint,
      totalBorrowAssets: x[2] as bigint,
      totalBorrowShares: x[3] as bigint,
      lastUpdate: x[4] as bigint,
      fee: x[5] as bigint,
    }
  }

  const obj = x as any
  if (
    typeof obj.totalSupplyAssets === 'bigint'
    && typeof obj.totalSupplyShares === 'bigint'
    && typeof obj.totalBorrowAssets === 'bigint'
    && typeof obj.totalBorrowShares === 'bigint'
    && typeof obj.lastUpdate === 'bigint'
    && typeof obj.fee === 'bigint'
  ) {
    return obj as MorphoMarketState
  }

  return undefined
}
