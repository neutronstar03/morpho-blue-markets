import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'
import { DEFILLAMA_CHAIN_SLUGS, fetchLlamaPrices } from '~/lib/defillama'
import { STALE_TIME_MEDIUM_MS } from '~/lib/hooks/query-stale-times'
import { useOraclePrice } from '~/lib/hooks/rpc/use-oracle-price'

export interface OracleDriftResult {
  oraclePrice: number | undefined
  defiLlamaPrice: number | undefined
  drift: number | undefined
  driftPct: number | undefined
  isLoading: boolean
  error: Error | null
}

export function useOracleDrift(market: SingleMorphoMarket): OracleDriftResult {
  const { oraclePrice, isLoading: isLoadingOracle, error: oracleError } = useOraclePrice(market)

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

  const {
    data: llamaData,
    isLoading: isLoadingLlama,
    error: llamaError,
  } = useQuery({
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

  const defiLlamaPrice = useMemo(() => {
    if (!llamaData?.coins || !collateralKey || !loanKey)
      return undefined
    const collateralEntry = llamaData.coins[collateralKey]
    const loanEntry = llamaData.coins[loanKey]
    if (!collateralEntry?.price || !loanEntry?.price)
      return undefined
    return collateralEntry.price / loanEntry.price
  }, [llamaData, collateralKey, loanKey])

  const drift = useMemo(() => {
    if (oraclePrice == null || defiLlamaPrice == null)
      return undefined
    return oraclePrice - defiLlamaPrice
  }, [oraclePrice, defiLlamaPrice])

  const driftPct = useMemo(() => {
    if (drift == null || defiLlamaPrice == null || defiLlamaPrice === 0)
      return undefined
    return (drift / defiLlamaPrice) * 100
  }, [drift, defiLlamaPrice])

  const isLoading = isLoadingOracle || isLoadingLlama
  const error = oracleError ?? llamaError ?? null

  return {
    oraclePrice,
    defiLlamaPrice,
    drift,
    driftPct,
    isLoading,
    error,
  }
}
