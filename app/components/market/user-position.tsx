import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import { useUserPosition } from '../../lib/hooks/use-morpho'
import type { FormattedMarket } from '~/lib/types'
import { useIsClient } from '../../lib/hooks/use-is-client';

interface UserPositionProps {
  market: FormattedMarket
}

export function UserPosition({ market }: UserPositionProps) {
  const isClient = useIsClient();
  const { address } = useAccount()
  const { data: position } = useUserPosition(market.id, address)

  console.log('user position', position)

  const userSupplyShares = position ? formatEther(position[0]) : '0'
  const userCollateral = position ? formatEther(position[2]) : '0'

  if (!address || !isClient) {
    return null
  }

  return (
    <div className="p-6">
      <div className="pt-6 border-t border-gray-700">
        <h4 className="font-medium text-gray-200 mb-3">Your Position</h4>
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Supply Shares:</p>
              <p className="font-medium text-white">{userSupplyShares}</p>
            </div>
            <div>
              <p className="text-gray-400">Collateral:</p>
              <p className="font-medium text-white">
                {userCollateral} {market.collateralAsset.symbol}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
