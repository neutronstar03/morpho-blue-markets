const ORACLE_PROVIDER_RANKS: Record<string, number> = {
  'api3': 3,
  'chainlink': 5,
  'chainlink + apx': 2,
  'chainlink + compound': 5,
  'chainlink + erc4626': 3,
  'chainlink + lido': 4,
  'chainlink + oval': 3,
  'chronicle': 4,
  'chronicle + chainlink': 4,
  'compound': 4,
  'erc4626': 3,
  'lido': 4,
  'lido + erc4626': 3,
  'midas': 2,
  'midas + chainlink': 3,
  'oval': 2,
  'oval + lido': 3,
  'pendle': 3,
  'pendle + chainlink': 3,
  'pendle + chronicle': 3,
  'pendle + erc4626': 3,
  'pendle + midas': 2,
  'pendle + redstone': 2,
  'pyth': 3,
  'pyth + chainlink': 4,
  'pyth + erc4626': 3,
  'redstone': 3,
  'redstone + chainlink': 3,
  'redstone + erc4626': 3,
}

function normalizeProviderLabel(label?: string | null) {
  return (label ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function getOracleProviderRank(label?: string | null) {
  return ORACLE_PROVIDER_RANKS[normalizeProviderLabel(label)] ?? 1
}
