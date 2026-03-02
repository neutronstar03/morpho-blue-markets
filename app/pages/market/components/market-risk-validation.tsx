import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { useSupplyAprOptimizer } from '~/lib/contexts/optimizer.context'
import { getExplorerUrl } from '~/lib/explorer'
import { setCollateralDecision } from '~/lib/market-risk/collateral-decisions'
import { useMarketRiskStatus } from '~/lib/market-risk/hooks'

interface MarketRiskValidationProps {
  market: SingleMorphoMarket
}

const GECKOTERMINAL_NETWORK_BY_CHAIN: Record<number, string> = {
  1: 'eth',
  42161: 'arbitrum',
  8453: 'base',
  10: 'optimism',
  137: 'polygon',
  130: 'unichain',
  999: 'hyperevm',
  747474: 'katana',
}

const DEXSCREENER_CHAIN_BY_ID: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  8453: 'base',
  10: 'optimism',
  137: 'polygon',
  130: 'unichain',
  999: 'hyperevm',
  747474: 'katana',
}

const COINGECKO_PLATFORM_BY_CHAIN: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum-one',
  8453: 'base',
  10: 'optimistic-ethereum',
  137: 'polygon-pos',
  130: 'unichain',
  999: 'hyperevm',
  747474: 'katana',
}

function getGeckoTerminalTokenUrl(chainId: number, address: string) {
  const network = GECKOTERMINAL_NETWORK_BY_CHAIN[chainId]
  if (!network)
    return ''
  return `https://www.geckoterminal.com/${network}/tokens/${address.toLowerCase()}`
}

function getDexscreenerTokenUrl(chainId: number, address: string) {
  const chain = DEXSCREENER_CHAIN_BY_ID[chainId]
  if (!chain)
    return ''
  return `https://dexscreener.com/${chain}/${address.toLowerCase()}`
}

function getCoingeckoContractUrl(chainId: number, address: string) {
  const platform = COINGECKO_PLATFORM_BY_CHAIN[chainId]
  if (!platform)
    return ''
  return `https://www.coingecko.com/en/coins/${platform}/contract/${address.toLowerCase()}`
}

export function MarketRiskValidation({ market }: MarketRiskValidationProps) {
  const optimizer = useSupplyAprOptimizer()

  const chainId = market.morphoBlue.chain.id
  const collateralAddress = market.collateralAsset.address
  const status = useMarketRiskStatus({
    chainId,
    uniqueKey: market.uniqueKey,
    loanAssetAddress: market.loanAsset.address,
    collateralAssetAddress: collateralAddress,
    loanAssetSymbol: market.loanAsset.symbol,
    collateralAssetSymbol: market.collateralAsset.symbol,
    warnings: market.warnings,
  })

  const onDecision = (decision: 'approve' | 'ban') => {
    setCollateralDecision(chainId, collateralAddress, decision)
    optimizer.clear()
  }

  const showActions = status?.status === 'yellow'

  if (!showActions)
    return null

  const explorerUrl = getExplorerUrl(chainId, collateralAddress as `0x${string}`)
  const geckoTerminalUrl = getGeckoTerminalTokenUrl(chainId, collateralAddress)
  const dexscreenerUrl = getDexscreenerTokenUrl(chainId, collateralAddress)
  const coingeckoUrl = getCoingeckoContractUrl(chainId, collateralAddress)

  return (
    <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 sm:p-4 shadow-[0_0_15px_rgba(249,115,22,0.05)]">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="warning" size="md">
              Unknown collateral
            </Badge>
            <div className="flex items-center gap-1">
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 hover:bg-white/15 transition-colors"
                  title="Open in explorer"
                  aria-label="Open collateral in explorer"
                >
                  <img src="/logos/etherscan-48.png" alt="Explorer" className="h-5 w-5 rounded-[4px] bg-white/70 p-[1px]" />
                </a>
              )}
              {geckoTerminalUrl && (
                <a
                  href={geckoTerminalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 hover:bg-white/15 transition-colors"
                  title="Open on GeckoTerminal"
                  aria-label="Open collateral on GeckoTerminal"
                >
                  <img src="/logos/geckoterminal-48.png" alt="GeckoTerminal" className="h-5 w-5 rounded-[4px]" />
                </a>
              )}
              {dexscreenerUrl && (
                <a
                  href={dexscreenerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 hover:bg-white/15 transition-colors"
                  title="Open on Dexscreener"
                  aria-label="Open collateral on Dexscreener"
                >
                  <img src="/logos/dexscreener-48.png" alt="Dexscreener" className="h-5 w-5 rounded-[4px]" />
                </a>
              )}
              {coingeckoUrl && (
                <a
                  href={coingeckoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 hover:bg-white/15 transition-colors"
                  title="Open on CoinGecko"
                  aria-label="Open collateral on CoinGecko"
                >
                  <img src="/logos/coingecko-48.png" alt="CoinGecko" className="h-5 w-5 rounded-[4px]" />
                </a>
              )}
            </div>
          </div>

          <div className="mt-2 max-w-full overflow-x-auto">
            <div className="inline-block bg-black/20 border border-white/5 rounded px-2 py-1">
              <span className="font-mono text-[11px] text-gray-300 select-all whitespace-nowrap" title={collateralAddress}>
                {collateralAddress}
              </span>
            </div>
          </div>

          {showActions && (
            <div className="mt-4 flex w-full items-center gap-2">
              <Button
                type="button"
                size="md"
                variant="outline"
                className="flex-1 border-green-700/30 text-green-300 hover:bg-green-900/20 bg-green-900/10"
                onClick={() => onDecision('approve')}
                aria-label="Approve collateral"
              >
                👌 Approve
              </Button>
              <Button
                type="button"
                size="md"
                variant="outline"
                className="flex-1 border-red-700/30 text-red-300 hover:bg-red-900/20 bg-red-900/10"
                onClick={() => onDecision('ban')}
                aria-label="Ban collateral"
              >
                ❌ Ban
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
