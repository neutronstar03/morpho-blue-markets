import type { FormattedMarket } from '~/lib/types'
import { useMemo } from 'react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { formatAmount } from '../../lib/formatters'
import { useIsClient } from '../../lib/hooks/use-is-client'
import { useMarket, useUserPosition } from '../../lib/hooks/use-morpho'

interface UserPositionProps {
  market: FormattedMarket
}

export function UserPosition({ market }: UserPositionProps) {
  const isClient = useIsClient()
  const { address } = useAccount()
  const { data: position, isLoading: isLoadingPosition } = useUserPosition(
    market.id,
    address,
  )
  const { data: marketState, isLoading: isLoadingMarketState } = useMarket(
    market.id,
  )

  const [userSupplyShares, userBorrowShares, userCollateral] = useMemo(
    () => position || [0n, 0n, 0n],
    [position],
  )
  const [
    totalSupplyAssets,
    totalSupplyShares,
    totalBorrowAssets,
    totalBorrowShares,
  ] = useMemo(
    () => marketState || [0n, 0n, 0n, 0n],
    [marketState],
  )

  const loanDecimals = market.loanAsset.decimals
  const collateralDecimals = market.collateralAsset.decimals || 18

  const suppliedAssets = useMemo(() => {
    if (totalSupplyShares === 0n)
      return 0n
    return (userSupplyShares * totalSupplyAssets) / totalSupplyShares
  }, [userSupplyShares, totalSupplyAssets, totalSupplyShares])

  const borrowedAssets = useMemo(() => {
    if (totalBorrowShares === 0n)
      return 0n
    return (userBorrowShares * totalBorrowAssets) / totalBorrowShares
  }, [userBorrowShares, totalBorrowAssets, totalBorrowShares])

  const isLoading = isLoadingPosition || isLoadingMarketState

  if (!address || !isClient) {
    return null
  }

  if (
    !isLoading
    && userSupplyShares === 0n
    && userBorrowShares === 0n
    && userCollateral === 0n
  ) {
    return null
  }

  return (
    <div className="p-6">
      <h4 className="font-medium text-gray-200 mb-3">Your Position</h4>
      {isLoading
        ? (
            <div className="text-gray-400">Loading your position...</div>
          )
        : (
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
              {userSupplyShares > 0n && (
                <div className="flex justify-between items-center text-sm">
                  <p className="text-gray-400">Supplied:</p>
                  <div className="text-right">
                    <p className="font-medium text-white">
                      {formatAmount(
                        Number(formatUnits(suppliedAssets, loanDecimals)),
                        loanDecimals,
                      )}
                      {' '}
                      {market.loanAsset.symbol}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatAmount(
                        Number(formatUnits(userSupplyShares, loanDecimals)),
                        loanDecimals,
                      )}
                      {' '}
                      shares
                    </p>
                  </div>
                </div>
              )}

              {userBorrowShares > 0n && (
                <div className="flex justify-between items-center text-sm">
                  <p className="text-gray-400">Borrowed:</p>
                  <div className="text-right">
                    <p className="font-medium text-white">
                      {formatAmount(
                        Number(formatUnits(borrowedAssets, loanDecimals)),
                        loanDecimals,
                      )}
                      {' '}
                      {market.loanAsset.symbol}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatAmount(
                        Number(formatUnits(userBorrowShares, loanDecimals)),
                        loanDecimals,
                      )}
                      {' '}
                      shares
                    </p>
                  </div>
                </div>
              )}

              {userCollateral > 0n && (
                <div className="flex justify-between items-center text-sm">
                  <p className="text-gray-400">Collateral:</p>
                  <p className="font-medium text-white">
                    {formatAmount(
                      Number(formatUnits(userCollateral, collateralDecimals)),
                      collateralDecimals,
                    )}
                    {' '}
                    {market.collateralAsset.symbol}
                  </p>
                </div>
              )}
            </div>
          )}
    </div>
  )
}
