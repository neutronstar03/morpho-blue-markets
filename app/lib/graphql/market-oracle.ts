// Normalize Morpho's nested oracle response without weakening the app's address contract.
export type RawMarketOracle<T> = Omit<T, 'oracleAddress'> & { oracle: unknown }

export function normalizeMarketOracle<T extends { oracle: unknown }>(market: T): Omit<T, 'oracle'> & { oracleAddress: string } {
  const oracle = market.oracle
  if (!oracle || typeof oracle !== 'object' || !('address' in oracle)
    || typeof oracle.address !== 'string' || !/^0x[\da-f]{40}$/i.test(oracle.address)) {
    // Missing upstream metadata must not become a usable market with an invented
    // address, or skip oracle-based safety checks as if the address were optional.
    throw new Error('Morpho market response is missing a valid oracle address')
  }
  const { oracle: _oracle, ...rest } = market
  return { ...rest, oracleAddress: oracle.address }
}

export function normalizeMarketOracles<T extends { oracle: unknown }>(markets: T[]): Array<Omit<T, 'oracle'> & { oracleAddress: string }> {
  // Morpho can return null when oracle metadata is unavailable. Exclude those
  // resources rather than fail healthy markets or bypass oracle-based checks.
  return markets.filter(market => market.oracle !== null).map(normalizeMarketOracle)
}
