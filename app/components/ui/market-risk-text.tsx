import type { ReactNode } from 'react'
import type { MarketRiskStatus } from '~/lib/market-risk/types'
import { cn } from '~/lib/utils'

type MarketRiskTextSize = 'sm' | 'md' | 'lg' | 'xl'

interface MarketRiskTextProps {
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
  size,
  className,
  children,
}: MarketRiskTextProps) {
  return (
    <span
      className={cn(
        getRiskTextColor(status),
        size ? getRiskTextSize(size) : '',
        className,
      )}
    >
      {children}
    </span>
  )
}
