import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { getSupportedChainName } from '~/lib/addresses'
import { getExplorerUrl } from '~/lib/explorer'

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

  return (
    <div className="p-6 border-b border-gray-700">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-x-2">
            <a
              className="flex items-center gap-x-2 hover:text-blue-400 transition-colors"
              href={loanAssetExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {market.loanAsset.symbol}
              <LinkNewWindow className="w-4 h-4" />
            </a>
            /
            <a
              className="flex items-center gap-x-2 hover:text-blue-400 transition-colors"
              href={collateralAssetExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {market.collateralAsset.symbol}
              <LinkNewWindow className="w-4 h-4" />
            </a>
          </h2>
          <p className="text-sm text-gray-400 mt-1">{chainName}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Market ID</p>
          <a
            href={`https://app.morpho.org/${chainName.toLowerCase()}/market/${market.uniqueKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-gray-300 hover:text-blue-400 transition-colors"
          >
            {formatAddress(market.uniqueKey)}
          </a>
        </div>
      </div>
    </div>
  )
}
