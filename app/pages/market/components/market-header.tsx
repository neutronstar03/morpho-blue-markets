import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { getSupportedChainName } from '~/lib/addresses'
import { getExplorerUrl } from '~/lib/explorer'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface MarketHeaderProps {
  market: SingleMorphoMarket
}

export function MarketHeader({ market }: MarketHeaderProps) {
  const chainName = getSupportedChainName(market.morphoBlue.chain.id)

  const loanAssetExplorerUrl = getExplorerUrl(
    market.morphoBlue.chain.id,
    market.loanAsset.address as `0x${string}`,
  )
  const collateralAssetExplorerUrl = getExplorerUrl(
    market.morphoBlue.chain.id,
    market.collateralAsset.address as `0x${string}`,
  )

  const morphoMarketUrl = morphoAppMarketUrl(chainName, market.uniqueKey)

  return (
    <div className="p-4 sm:p-6 border-b border-gray-700">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 flex flex-wrap items-center gap-x-2">
            <a
              className="flex items-center gap-x-2 hover:text-blue-400 transition-colors"
              href={collateralAssetExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {market.collateralAsset.symbol}
              <LinkNewWindow className="w-4 h-4" />
            </a>
            <span className="text-gray-500 mx-1">/</span>
            <a
              className="flex items-center gap-x-2 hover:text-blue-400 transition-colors"
              href={loanAssetExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {market.loanAsset.symbol}
              <LinkNewWindow className="w-4 h-4" />
            </a>
          </h2>
          <p className="text-sm text-gray-400 mt-1">{chainName}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-sm text-gray-400">Market ID</p>
          <a
            href={morphoMarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-gray-300 hover:text-blue-400 transition-colors inline-flex items-center gap-x-2 mt-1"
            title="Open in Morpho official UI"
          >
            {formatAddress(market.uniqueKey)}
            <LinkNewWindow className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
