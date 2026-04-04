function toBigint(value: bigint | string): bigint {
  return typeof value === 'bigint' ? value : BigInt(value || '0')
}

export function getSuppliedAssetsFromShares(params: {
  userSupplyShares: bigint | string
  totalSupplyAssets: bigint | string
  totalSupplyShares: bigint | string
}): bigint {
  const userSupplyShares = toBigint(params.userSupplyShares)
  const totalSupplyAssets = toBigint(params.totalSupplyAssets)
  const totalSupplyShares = toBigint(params.totalSupplyShares)

  if (userSupplyShares <= 0n || totalSupplyAssets <= 0n || totalSupplyShares <= 0n)
    return 0n

  return (userSupplyShares * totalSupplyAssets) / totalSupplyShares
}

export function hasVisibleSuppliedAssets(params: {
  userSupplyShares: bigint | string
  totalSupplyAssets: bigint | string
  totalSupplyShares: bigint | string
}): boolean {
  return getSuppliedAssetsFromShares(params) > 0n
}
