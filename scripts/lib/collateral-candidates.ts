function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid collateral discovery response')
  return value as Record<string, unknown>
}

export function parseCollateralCandidates(value: unknown, chainId: number) {
  const items = object(object(value).markets).items
  if (!Array.isArray(items))
    throw new Error('Invalid collateral discovery items')
  const addresses: string[] = []
  for (const raw of items) {
    const item = object(raw)
    if (object(object(item.morphoBlue).chain).id !== chainId)
      throw new Error('Collateral discovery chain mismatch')
    // A null collateral is not a collateral candidate; retain the raw page size.
    if (item.collateralAsset === null)
      continue
    const address = object(item.collateralAsset).address
    if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address))
      throw new Error('Invalid collateral discovery address')
    addresses.push(address.toLowerCase())
  }
  return { addresses, rawCount: items.length }
}
