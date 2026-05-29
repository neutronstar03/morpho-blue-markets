import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { formatBigintShort } from '~/lib/formatters'
import { useLiveMarketPosition } from '~/lib/hooks/rpc/use-live-market-positions'
import { useIsClient } from '~/lib/hooks/use-is-client'

// While having similar name as position.tsx, this component is specific to a single market

interface MarketPositionProps {
  market: SingleMorphoMarket
}

function formatDurationAgo(seconds: bigint) {
  if (seconds < 5n)
    return 'just now'
  if (seconds < 60n)
    return `${seconds}s ago`

  const minutes = seconds / 60n
  if (minutes < 60n)
    return `${minutes}m ago`

  const hours = minutes / 60n
  const remainingMinutes = minutes % 60n
  if (hours < 48n)
    return `${hours}h${remainingMinutes > 0n ? ` ${remainingMinutes}m` : ''} ago`

  const days = hours / 24n
  return `${days}d ago`
}

export function MarketPosition({ market }: MarketPositionProps) {
  const isClient = useIsClient()
  const { address: connectedAddress } = useAccount()
  const { viewingAddress, isViewingWallet } = useViewingWallet()
  const address = viewingAddress ?? connectedAddress
  const { data: position, isLoading } = useLiveMarketPosition({ market, address })
  const userSupplyShares = position?.userState.supplyShares ?? 0n

  const loanDecimals = market.loanAsset.decimals
  const suppliedAssets = position?.liveState?.suppliedAssets ?? 0n

  const projectedPosition = useMemo(() => {
    if (!position?.liveState?.projectedSuppliedAssets || position.liveState.projectedSuppliedAssets <= 0n)
      return undefined
    const secondsSinceLastMarketUpdate = position.liveState.secondsSinceLastMarketUpdate ?? 0n

    return {
      amount: position.liveState.projectedSuppliedAssets,
      lastMarketUpdateAgo: formatDurationAgo(secondsSinceLastMarketUpdate),
    }
  }, [position])

  if (!isClient) {
    return null
  }

  if (!address) {
    return (
      <>
        <h4 className="font-medium text-gray-200 mb-3">{isViewingWallet ? 'Viewed Wallet Position' : 'Your Position'}</h4>
        <div className="bg-gray-900/50 border border-cyan-700 rounded-lg p-4">
          <p className="text-cyan-400 text-sm">
            Connect wallet to see position
          </p>
        </div>
      </>
    )
  }

  if (
    !isLoading
    && suppliedAssets <= 0n
  ) {
    return null
  }

  return (
    <>
      <h4 className="font-medium text-gray-200 mb-3">{isViewingWallet ? 'Viewed Wallet Position' : 'Your Position'}</h4>
      {isLoading
        ? (
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400">Loading your position...</p>
            </div>
          )
        : (
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
              {suppliedAssets > 0n && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-400">Supplied:</p>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatBigintShort(suppliedAssets, loanDecimals)}
                        {' '}
                        {market.loanAsset.symbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBigintShort(userSupplyShares, 18)}
                        {' '}
                        shares
                      </p>
                    </div>
                  </div>
                  {projectedPosition != null && projectedPosition.amount > 0n && (
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-1.5 text-gray-400">
                        <p>Projected amount:</p>
                        <InfoTooltip
                          ariaLabel="Projected amount details"
                          align="start"
                          content={(
                            <div className="space-y-1">
                              <p>
                                Estimated with local interest accrual since the market was last updated onchain,
                                {' '}
                                {projectedPosition.lastMarketUpdateAgo}
                                .
                              </p>
                              <p className="text-gray-400">
                                This becomes exact after the next Morpho accrual transaction for this market.
                              </p>
                            </div>
                          )}
                          side="top"
                        />
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium text-cyan-300">
                          ≈
                          {formatBigintShort(projectedPosition.amount, loanDecimals)}
                          {' '}
                          {market.loanAsset.symbol}
                        </p>
                        <p className="text-xs text-gray-500">
                          last update
                          {' '}
                          {projectedPosition.lastMarketUpdateAgo}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
    </>
  )
}
