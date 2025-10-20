import { config } from '~/lib/wagmi'

export function getExplorerUrl(chainId: number, address: `0x${string}`) {
  const chain = config.chains.find(c => c.id === chainId)

  if (chain?.blockExplorers?.default.url)
    return `${chain.blockExplorers.default.url}/address/${address}`

  return ''
}
