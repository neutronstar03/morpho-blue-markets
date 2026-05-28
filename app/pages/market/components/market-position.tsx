import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useReadContract } from 'wagmi'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { IRM_RATE_AT_TARGET_ABI } from '~/lib/abis/simplified'
import { useNetworkContext } from '~/lib/contexts/network'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { formatBigintShort } from '~/lib/formatters'
import { useMarket, useUserPosition } from '~/lib/hooks/rpc/use-morpho'
import { useIsClient } from '~/lib/hooks/use-is-client'
import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { getSuppliedAssetsFromShares } from '~/lib/morpho/position-visibility'
import { projectMorphoMarketAccrual } from '~/lib/morpho/project-accrual'

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
  const chainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const effectiveChainId = requiredChainId ?? chainId
  const [projectionTimestamp, setProjectionTimestamp] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const interval = window.setInterval(() => {
      setProjectionTimestamp(Math.floor(Date.now() / 1000))
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [])

  const { data: position, isLoading: isLoadingPosition } = useUserPosition(
    market.uniqueKey,
    address,
  )
  const { data: marketState, isLoading: isLoadingMarketState } = useMarket(
    market.uniqueKey,
  )

  const { data: rateAtTarget } = useReadContract({
    chainId: effectiveChainId,
    address: market.irmAddress as `0x${string}`,
    abi: IRM_RATE_AT_TARGET_ABI,
    functionName: 'rateAtTarget',
    args: [market.uniqueKey as `0x${string}`],
    query: {
      enabled: !!market.irmAddress && !!market.uniqueKey,
      staleTime: 5 * 60 * 1000,
    },
  })

  const [userSupplyShares] = useMemo(
    () => position || [0n],
    [position],
  )
  const [
    totalSupplyAssets,
    totalSupplyShares,
  ] = useMemo(
    () => marketState || [0n, 0n],
    [marketState],
  )

  const loanDecimals = market.loanAsset.decimals

  const suppliedAssets = useMemo(() => {
    return getSuppliedAssetsFromShares({
      userSupplyShares,
      totalSupplyAssets,
      totalSupplyShares,
    })
  }, [userSupplyShares, totalSupplyAssets, totalSupplyShares])

  const projectedPosition = useMemo(() => {
    const normalizedMarketState = normalizeMorphoMarketState(marketState)
    if (!normalizedMarketState || rateAtTarget == null)
      return undefined

    const timestamp = BigInt(projectionTimestamp)

    const projectedMarketState = projectMorphoMarketAccrual({
      marketId: market.uniqueKey as `0x${string}`,
      market: normalizedMarketState,
      rateAtTarget,
      timestamp,
    })

    const amount = getSuppliedAssetsFromShares({
      userSupplyShares,
      totalSupplyAssets: projectedMarketState.totalSupplyAssets,
      totalSupplyShares: projectedMarketState.totalSupplyShares,
    })

    const secondsSinceLastMarketUpdate = timestamp > normalizedMarketState.lastUpdate
      ? timestamp - normalizedMarketState.lastUpdate
      : 0n

    return {
      amount,
      lastMarketUpdateAgo: formatDurationAgo(secondsSinceLastMarketUpdate),
    }
  }, [market.uniqueKey, marketState, projectionTimestamp, rateAtTarget, userSupplyShares])

  const isLoading = isLoadingPosition || isLoadingMarketState

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
