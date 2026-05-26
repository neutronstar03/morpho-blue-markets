import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { formatUnits } from 'viem'
import { useReadContract } from 'wagmi'

const ORACLE_PRICE_ABI = [
  {
    type: 'function',
    name: 'price',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function useOraclePrice(market: SingleMorphoMarket) {
  const chainId = market.morphoBlue.chain.id

  const { data: rawPrice, isLoading, error } = useReadContract({
    chainId,
    address: market.oracleAddress as `0x${string}`,
    abi: ORACLE_PRICE_ABI,
    functionName: 'price',
    query: {
      enabled: !!market.oracleAddress && !!chainId,
    },
  })

  const oraclePrice = useMemo(() => {
    if (rawPrice == null)
      return undefined

    const loanDecimals = market.loanAsset.decimals ?? 18
    const collateralDecimals = market.collateralAsset.decimals ?? 18
    const scale = 36 + loanDecimals - collateralDecimals

    return Number(formatUnits(rawPrice, scale))
  }, [rawPrice, market.loanAsset.decimals, market.collateralAsset.decimals])

  return {
    oraclePrice,
    isLoading,
    error,
  }
}
