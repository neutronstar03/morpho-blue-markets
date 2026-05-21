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
  const strokeColor = isMono ? 'currentColor' : 'white'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 601 601"
      fill="none"
      className={className}
    >
      <path d="M531.166 159.484L297.328 159.854C219.9 159.854 157.129 222.625 157.129 300.053C157.129 377.481 219.9 440.253 297.328 440.253H522.509" stroke={strokeColor} strokeWidth="56.2469" strokeMiterlimit="10" strokeLinecap="round" />
      <path d="M31.832 300.053H571.981" stroke={strokeColor} strokeWidth="56.2469" strokeMiterlimit="10" strokeLinecap="round" />
      <path d="M300.051 28.1235C450.233 28.1235 571.981 149.871 571.981 300.053C571.981 450.236 450.233 571.983 300.051 571.983C149.868 571.983 28.1211 450.236 28.1211 300.053C28.1211 149.871 149.868 28.1235 300.051 28.1235Z" stroke={strokeColor} strokeWidth="56.2469" strokeMiterlimit="10" strokeLinecap="round" />
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
