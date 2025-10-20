import type { SingleMorphoMarket } from '~/lib/hooks/use-market'
import { useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useNetworkContext } from '~/lib/contexts/network'
import { formatAmountSpecific } from '../../lib/formatters'
import { useIsClient } from '../../lib/hooks/use-is-client'
import { useMarket, useUserPosition } from '../../lib/hooks/use-morpho'

interface UserPositionProps {
  market: SingleMorphoMarket
}

export function UserPosition({ market }: UserPositionProps) {
  const isClient = useIsClient()
  const { address } = useAccount()
  const chainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const { data: position, isLoading: isLoadingPosition } = useUserPosition(
    market.uniqueKey,
    address,
  )
  const { data: marketState, isLoading: isLoadingMarketState } = useMarket(
    market.uniqueKey,
  )

  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

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
    if (totalSupplyShares === 0n)
      return 0n
    return (userSupplyShares * totalSupplyAssets) / totalSupplyShares
  }, [userSupplyShares, totalSupplyAssets, totalSupplyShares])

  const isLoading = isLoadingPosition || isLoadingMarketState

  if (!isClient) {
    return null
  }

  if (!address) {
    return (
      <>
        <h4 className="font-medium text-gray-200 mb-3">Your Position</h4>
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
    && !isWrongNetwork
    && userSupplyShares === 0n
  ) {
    return null
  }

  return (
    <>
      <h4 className="font-medium text-gray-200 mb-3">Your Position</h4>
      {isWrongNetwork
        ? (
            <div className="bg-gray-900/50 border border-yellow-700 rounded-lg p-4">
              <p className="text-yellow-400 text-sm">
                Please switch to the correct network to see your position.
              </p>
            </div>
          )
        : isLoading
          ? (
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                <p className="text-gray-400">Loading your position...</p>
              </div>
            )
          : (
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
                {userSupplyShares > 0n && (
                  <div className="flex justify-between items-center text-sm">
                    <p className="text-gray-400">Supplied:</p>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatAmountSpecific(suppliedAssets, loanDecimals)}
                        {' '}
                        {market.loanAsset.symbol}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatAmountSpecific(userSupplyShares, loanDecimals)}
                        {' '}
                        shares
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
    </>
  )
}
