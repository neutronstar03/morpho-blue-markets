import type { ReactNode } from 'react'
import type { MarketRiskStatus } from '~/lib/market-risk/types'
import { getAssetBlacklistReason } from '~/lib/market-blacklist'
import { getSharedDecision } from '~/lib/reviews/shared-decisions'
import { useSharedDecisionsVersion } from '~/lib/reviews/use-shared-decisions'
import { cn } from '~/lib/utils'

type MarketRiskTextSize = 'sm' | 'md' | 'lg' | 'xl'

interface MarketRiskTextProps {
  chainId?: number
  collateralAddress?: string
  status?: MarketRiskStatus
  size?: MarketRiskTextSize
  className?: string
  children: ReactNode
}

function getRiskTextColor(status?: MarketRiskStatus) {
  if (status === 'blue')
    return 'text-blue-300'
  if (status === 'yellow')
    return 'text-yellow-300'
  if (status === 'purple')
    return 'text-fuchsia-300'
  if (status === 'black')
    return 'text-red-300'
  return 'text-white'
}

function getRiskTextSize(size: MarketRiskTextSize) {
  if (size === 'sm')
    return 'text-sm'
  if (size === 'lg')
    return 'text-lg'
  if (size === 'xl')
    return 'text-xl'
  return 'text-base'
}

export function MarketRiskText({
  status,
  chainId,
  collateralAddress,
  size,
  className,
  children,
}: MarketRiskTextProps) {
  useSharedDecisionsVersion()
  const shared = getSharedDecision(chainId, collateralAddress)
  const blacklistReason = getAssetBlacklistReason(collateralAddress, chainId)
  const reason = blacklistReason ?? shared?.reason
  const label = status === 'black' || blacklistReason
    ? 'Blocked'
    : shared?.decision === 'whitelist'
      ? 'Whitelist'
      : status === 'white' ? 'Allowed' : status === 'yellow' ? 'Pending review' : null
  return (
    <span
      title={reason}
      className={cn(
        getRiskTextColor(status),
        size ? getRiskTextSize(size) : '',
        className,
      )}
    >
      {children}
      {label && (
        <span className="ml-1 text-xs font-normal">
          [
          {label}
          ]
        </span>
      )}
      {reason && (
        <span className="block max-w-xs truncate text-xs font-normal">
          {shared?.decision === 'blacklist' || (!blacklistReason && shared) ? 'Dot review: ' : 'Shared blacklist: '}
          {reason}
        </span>
      )}
    </span>
  )
}
