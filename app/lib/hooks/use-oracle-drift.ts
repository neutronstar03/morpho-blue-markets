import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'
import { DEFILLAMA_CHAIN_SLUGS, fetchLlamaPrices } from '~/lib/defillama'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'
import { useOraclePrice } from '~/lib/hooks/rpc/use-oracle-price'
import { useSwapEstimate } from '~/lib/hooks/use-swap-estimate'
import { isKyberSwapSupportedChain } from '~/lib/kyberswap'

export interface OracleDriftResult {
  oraclePrice: number | undefined
  marketPrice: number | undefined
  drift: number | undefined
  driftPct: number | undefined
  isLoading: boolean
  error: Error | null
}

function useDefiLlamaPrice(market: SingleMorphoMarket) {
  const chainName = getSupportedChainName(market.morphoBlue.chain.id)
  const llamaSlug = typeof chainName === 'string' && chainName in DEFILLAMA_CHAIN_SLUGS
    ? DEFILLAMA_CHAIN_SLUGS[chainName as keyof typeof DEFILLAMA_CHAIN_SLUGS]
    : undefined

  const collateralKey = llamaSlug
    ? `${llamaSlug}:${market.collateralAsset.address.toLowerCase()}`
    : undefined
  const loanKey = llamaSlug
    ? `${llamaSlug}:${market.loanAsset.address.toLowerCase()}`
    : undefined

  return useQuery({
    queryKey: ['defillama-prices', collateralKey, loanKey],
    queryFn: async () => {
      if (!collateralKey || !loanKey)
        return null
      const keys = [collateralKey, loanKey]
      return fetchLlamaPrices(keys)
    },
    enabled: !!collateralKey && !!loanKey,
    staleTime: STALE_TIME_MEDIUM_MS,
  })
}

export function useOracleDrift(market: SingleMorphoMarket): OracleDriftResult {
  const { oraclePrice, isLoading: isLoadingOracle, error: oracleError } = useOraclePrice(market)

  const chainId = market.morphoBlue.chain.id
  const isKyberSupported = isKyberSwapSupportedChain(chainId)

  // Primary path: KyberSwap route simulation for supported chains.
  const {
    effectivePrice: swapPrice,
    isLoading: isLoadingSwap,
    error: swapError,
  } = useSwapEstimate(market)

  // Fallback path: DefiLlama for chains not supported by KyberSwap.
  const {
    data: llamaData,
    isLoading: isLoadingLlama,
    error: llamaError,
  } = useDefiLlamaPrice(market)

  const defiLlamaPrice = useMemo(() => {
    if (!llamaData?.coins)
      return undefined
    const chainName = getSupportedChainName(chainId)
    const llamaSlug = typeof chainName === 'string' && chainName in DEFILLAMA_CHAIN_SLUGS
      ? DEFILLAMA_CHAIN_SLUGS[chainName as keyof typeof DEFILLAMA_CHAIN_SLUGS]
      : undefined
    if (!llamaSlug)
      return undefined
    const collateralKey = `${llamaSlug}:${market.collateralAsset.address.toLowerCase()}`
    const loanKey = `${llamaSlug}:${market.loanAsset.address.toLowerCase()}`
    const collateralEntry = llamaData.coins[collateralKey]
    const loanEntry = llamaData.coins[loanKey]
    if (!collateralEntry?.price || !loanEntry?.price)
      return undefined
    return collateralEntry.price / loanEntry.price
  }, [llamaData, chainId, market.collateralAsset.address, market.loanAsset.address])

  const marketPrice = isKyberSupported ? swapPrice : defiLlamaPrice

  const drift = useMemo(() => {
    if (oraclePrice == null || marketPrice == null)
      return undefined
    return oraclePrice - marketPrice
  }, [oraclePrice, marketPrice])

  const driftPct = useMemo(() => {
    if (drift == null || marketPrice == null || marketPrice === 0)
      return undefined
    return (drift / marketPrice) * 100
  }, [drift, marketPrice])

  const isLoading = isLoadingOracle || (isKyberSupported ? isLoadingSwap : isLoadingLlama)
  const error = oracleError ?? (isKyberSupported ? swapError : llamaError) ?? null

  return {
    oraclePrice,
    marketPrice,
    drift,
    driftPct,
    isLoading,
    error,
  }
}
