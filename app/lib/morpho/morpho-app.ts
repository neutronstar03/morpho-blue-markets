export function morphoAppChainSlug(chainName: string) {
  const exceptions: Record<string, string> = {
    'hyperliquid': 'hyperevm',
    'optimism': 'opmainnet',
    'world chain': 'world-chain',
  }

  return exceptions[chainName.toLowerCase()] ?? chainName.toLowerCase()
}

export function morphoAppMarketUrl(chainName: string, marketId: string) {
  return `https://app.morpho.org/${morphoAppChainSlug(chainName)}/market/${marketId}`
}

export function morphoAppVaultUrl(chainName: string, vaultAddress: string) {
  return `https://app.morpho.org/${morphoAppChainSlug(chainName)}/vault/${vaultAddress}`
}
