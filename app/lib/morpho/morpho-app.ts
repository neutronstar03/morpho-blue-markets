export function morphoAppMarketUrl(chainName: string, marketId: string) {
  const exceptions: Record<string, string> = {
    hyperliquid: 'hyperevm',
  }

  const safeChainName = exceptions[chainName.toLowerCase()] ?? chainName.toLowerCase()
  return `https://app.morpho.org/${safeChainName}/market/${marketId}`
}
