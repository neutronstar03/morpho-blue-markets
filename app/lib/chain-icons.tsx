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
}
