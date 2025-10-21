import type { SupportedChain } from '../../addresses'
import type { SupplyMarketData } from '../graphql/use-markets-by-chain'

import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { getSupportedChainName, morphoAddressOnChain } from '../../addresses'
import { useMarketsByChain } from '../graphql/use-markets-by-chain'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from './simplified.abi'

export interface LiveMarketPosition {
  market: SupplyMarketData
  userState: {
    supplyShares: bigint
    borrowShares: bigint
    collateral: bigint
  }
}

interface PositionCall {
  address: `0x${string}`
  abi: typeof SIMPLIFIED_MORPHO_BLUE_ABI
  functionName: 'position'
  args: readonly [`0x${string}`, `0x${string}`]
}

export function useLiveMarketPositions() {
  const { address: userAddress, chain } = useAccount()

  const { data: markets, isLoading: isLoadingMarkets } = useMarketsByChain(
    chain?.id,
  )

  const morphoAddress = useMemo(() => {
    if (!chain)
      return undefined
    const chainName = getSupportedChainName(chain.id)
    if (chainName.startsWith('Chain '))
      return undefined
    return morphoAddressOnChain[chainName as SupportedChain]
  }, [chain])

  const multicallContracts = useMemo<PositionCall[]>(() => {
    if (!markets || !userAddress || !morphoAddress)
      return []

    return markets.map<PositionCall>(market => ({
      address: morphoAddress as `0x${string}`,
      abi: SIMPLIFIED_MORPHO_BLUE_ABI,
      functionName: 'position',
      args: [market.uniqueKey as `0x${string}`, userAddress as `0x${string}`] as const,
    }))
  }, [markets, userAddress, morphoAddress])

  const {
    data: positionResults,
    isLoading: isLoadingPositions,
    refetch,
    dataUpdatedAt,
  } = useReadContracts({
    contracts: multicallContracts,
    allowFailure: true,
    query: {
      enabled: !!markets && !!userAddress && !!morphoAddress,
    },
  })

  const userPositions = useMemo<LiveMarketPosition[]>(() => {
    if (!markets || !positionResults)
      return []

    return markets
      .map((market, index) => {
        const result = positionResults[index]
        if (result.status !== 'success' || !result.result)
          return null

        const [supplyShares, borrowShares, collateral] = result.result as readonly [bigint, bigint, bigint]
        const hasPosition
          = supplyShares > 0n || borrowShares > 0n || collateral > 0n

        if (!hasPosition)
          return null

        return {
          market,
          userState: { supplyShares, borrowShares, collateral },
        }
      })
      .filter((p): p is LiveMarketPosition => p !== null)
  }, [markets, positionResults])

  return {
    data: userPositions,
    isLoading: isLoadingMarkets || isLoadingPositions,
    refetch,
    dataUpdatedAt,
  }
}
