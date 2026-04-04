import { config } from '~/lib/wagmi'

const EXPLORER_BASE_URL_BY_CHAIN: Partial<Record<number, string>> = {
  143: 'https://monad.socialscan.io',
}

export function getExplorerUrl(chainId: number, address: `0x${string}`) {
  const chain = config.chains.find(c => c.id === chainId)

  if (chain?.blockExplorers?.default.url)
    return `${chain.blockExplorers.default.url}/address/${address}`

  const fallbackExplorerBaseUrl = EXPLORER_BASE_URL_BY_CHAIN[chainId]
  if (fallbackExplorerBaseUrl)
    return `${fallbackExplorerBaseUrl}/address/${address}`

  return ''
}

export function getExplorerTransactionUrl(chainId: number, hash: `0x${string}`) {
  const chain = config.chains.find(c => c.id === chainId)

  if (chain?.blockExplorers?.default.url)
    return `${chain.blockExplorers.default.url}/tx/${hash}`

  const fallbackExplorerBaseUrl = EXPLORER_BASE_URL_BY_CHAIN[chainId]
  if (fallbackExplorerBaseUrl)
    return `${fallbackExplorerBaseUrl}/tx/${hash}`

  return ''
}
