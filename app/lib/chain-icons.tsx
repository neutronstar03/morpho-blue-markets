import type { ComponentType } from 'react'
import {
  NetworkArbitrumOne,
  NetworkBase,
  NetworkEthereum,
  NetworkHyperEvm,
  NetworkKatana,
  NetworkMonad,
  NetworkOptimism,
  NetworkPolygon,
  NetworkStable,
  NetworkUnichain,
} from '@web3icons/react'

export type ChainIconComponent = ComponentType<{
  size?: string | number
  className?: string
  variant?: 'branded' | 'background' | 'mono'
}>

export const NetworkWorldChain: ChainIconComponent = ({ size = 24, className, variant }) => {
  const isMono = variant === 'mono'
  const circleColor = isMono ? 'stroke-current' : 'stroke-white'
  const pathColor = isMono ? 'stroke-current' : 'stroke-sky-400'
  const lineColor = isMono ? 'stroke-current' : 'stroke-white/80'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" className={circleColor} />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" className={pathColor} />
      <line x1="2" y1="12" x2="22" y2="12" className={lineColor} />
    </svg>
  )
}

export const CHAIN_ICON_BY_ID: Record<number, ChainIconComponent | undefined> = {
  1: NetworkEthereum,
  10: NetworkOptimism,
  130: NetworkUnichain,
  137: NetworkPolygon,
  143: NetworkMonad,
  988: NetworkStable,
  999: NetworkHyperEvm,
  8453: NetworkBase,
  42161: NetworkArbitrumOne,
  747474: NetworkKatana,
  480: NetworkWorldChain,
}
