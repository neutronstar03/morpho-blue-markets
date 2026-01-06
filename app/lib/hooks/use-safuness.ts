import { useMemo } from 'react'
import { useCollateralSupplyAggregate } from '~/lib/hooks/graphql/use-collateral-supply-aggregate'
import { useTokenLiquidity } from '~/lib/hooks/use-token-liquidity'

export function safunessColorClass(ratio: number | undefined) {
  if (ratio == null)
    return 'text-gray-400'
  if (ratio >= 5)
    return 'text-green-400'
  if (ratio >= 3)
    return 'text-yellow-400'
  return 'text-red-400'
}

export interface UseSafunessArgs {
  chainId?: number
  collateralAddress?: string
}

export function useSafuness({ chainId, collateralAddress }: UseSafunessArgs) {
  const {
    data: liquidityStr,
    isLoading: isLoadingLiquidity,
  } = useTokenLiquidity({
    chainId,
    tokenAddress: collateralAddress,
  })

  const {
    data: totalCollateralSupplyUsd,
    isLoading: isLoadingSupply,
  } = useCollateralSupplyAggregate({
    chainId,
    collateralAddress,
  })

  const liquidityUsd = useMemo(() => {
    if (!liquidityStr)
      return undefined
    const n = Number(liquidityStr)
    return Number.isFinite(n) ? n : undefined
  }, [liquidityStr])

  // Conservatively assume ~50% of pool liquidity is directly usable in the collateral token
  const effectiveLiquidityUsd = useMemo(
    () => (liquidityUsd != null ? liquidityUsd / 2 : undefined),
    [liquidityUsd],
  )

  const safuness = useMemo(() => {
    if (effectiveLiquidityUsd == null)
      return undefined
    if (totalCollateralSupplyUsd == null || totalCollateralSupplyUsd <= 0)
      return undefined
    return effectiveLiquidityUsd / totalCollateralSupplyUsd
  }, [effectiveLiquidityUsd, totalCollateralSupplyUsd])

  return {
    liquidityUsd,
    effectiveLiquidityUsd,
    totalCollateralSupplyUsd,
    safuness,
    isLoadingLiquidity,
    isLoadingSupply,
    isLoadingSafuness: isLoadingLiquidity || isLoadingSupply,
  }
}
