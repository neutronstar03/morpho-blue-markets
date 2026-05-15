import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { Settings2 } from 'lucide-react'
import { useState } from 'react'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { Button } from '~/components/ui/button'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { getSupportedChainName } from '~/lib/addresses'
import { getExplorerUrl } from '~/lib/explorer'
import { useMarketRiskStatus } from '~/lib/market-risk/hooks'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { getMarketSystemUnhealthyEntry, useUnhealthyMarketsVersion } from '~/lib/unhealthy-markets'
import { LocalCollateralBlacklistControl } from './local-collateral-blacklist-control'

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface MarketHeaderProps {
  market: SingleMorphoMarket
}

export function MarketHeader({ market }: MarketHeaderProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const unhealthyMarketsVersion = useUnhealthyMarketsVersion()
  const chainName = getSupportedChainName(market.morphoBlue.chain.id)
  const { status } = useMarketRiskStatus({
    chainId: market.morphoBlue.chain.id,
    uniqueKey: market.uniqueKey,
    loanAssetAddress: market.loanAsset.address,
    collateralAssetAddress: market.collateralAsset.address,
    loanAssetSymbol: market.loanAsset.symbol,
    collateralAssetSymbol: market.collateralAsset.symbol,
    warnings: market.warnings,
  })

  const loanAssetExplorerUrl = getExplorerUrl(
    market.morphoBlue.chain.id,
    market.loanAsset.address as `0x${string}`,
  )
  const collateralAssetExplorerUrl = getExplorerUrl(
    market.morphoBlue.chain.id,
    market.collateralAsset.address as `0x${string}`,
  )

  const morphoMarketUrl = morphoAppMarketUrl(chainName, market.uniqueKey)
  const unhealthyEntry = (() => {
    void unhealthyMarketsVersion
    return getMarketSystemUnhealthyEntry(market.uniqueKey, market.morphoBlue.chain.id)
  })()

  return (
    <div className="border-b border-gray-700 p-3 sm:p-6">
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="flex min-w-0 flex-wrap items-center gap-x-2 text-xl font-bold text-white sm:text-2xl">
              <a
                className="flex items-center gap-x-2 transition-colors hover:text-blue-400"
                href={collateralAssetExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MarketRiskText status={status} size="xl">
                  {market.collateralAsset.symbol}
                </MarketRiskText>
                <LinkNewWindow className="w-4 h-4" />
              </a>
              <span className="text-gray-500 mx-1">/</span>
              <a
                className="flex items-center gap-x-2 transition-colors hover:text-blue-400"
                href={loanAssetExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="text-white text-xl">{market.loanAsset.symbol}</span>
                <LinkNewWindow className="w-4 h-4" />
              </a>
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={isAdvancedOpen
                ? 'hidden h-8 w-8 shrink-0 border-cyan-500/40 bg-cyan-500/10 px-0 text-cyan-300 hover:bg-cyan-500/20 sm:inline-flex'
                : 'hidden h-8 w-8 shrink-0 border-white/10 bg-white/[0.03] px-0 text-gray-400 hover:bg-white/[0.08] hover:text-gray-200 sm:inline-flex'}
              onClick={() => setIsAdvancedOpen(prev => !prev)}
              aria-label={isAdvancedOpen ? 'Close advanced options' : 'Open advanced options'}
              aria-expanded={isAdvancedOpen}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-gray-400">{chainName}</p>
            {unhealthyEntry && (
              <span
                className="inline-flex rounded-full border border-red-700/40 bg-red-900/20 px-2 py-0.5 text-[11px] font-medium text-red-200"
                title={`Unhealthy borrowers: $${unhealthyEntry.unhealthyBorrowUsd.toLocaleString()} borrow across ${unhealthyEntry.unhealthyBorrowerCount} borrower(s); min health ${unhealthyEntry.minHealthFactor}.`}
              >
                Unhealthy borrowers
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={isAdvancedOpen
                ? 'h-7 w-7 shrink-0 border-cyan-500/40 bg-cyan-500/10 px-0 text-cyan-300 hover:bg-cyan-500/20 sm:hidden'
                : 'h-7 w-7 shrink-0 border-white/10 bg-white/[0.03] px-0 text-gray-400 hover:bg-white/[0.08] hover:text-gray-200 sm:hidden'}
              onClick={() => setIsAdvancedOpen(prev => !prev)}
              aria-label={isAdvancedOpen ? 'Close advanced options' : 'Open advanced options'}
              aria-expanded={isAdvancedOpen}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-400 sm:text-sm">Market ID</p>
          <a
            href={morphoMarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-x-1.5 font-mono text-xs text-gray-300 transition-colors hover:text-blue-400 sm:gap-x-2 sm:text-sm"
            title="Open in Morpho official UI"
          >
            {formatAddress(market.uniqueKey)}
            <LinkNewWindow className="w-4 h-4" />
          </a>
        </div>
      </div>
      <LocalCollateralBlacklistControl market={market} isOpen={isAdvancedOpen} />
    </div>
  )
}
