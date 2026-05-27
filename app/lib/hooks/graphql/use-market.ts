import { useQuery } from '@tanstack/react-query'
import { gql, request } from 'graphql-request'
import { STALE_TIME_SHORT_MS } from '~/lib/hooks/query-stale-times'
import { isOracleMisconfiguredWarning } from '~/lib/morpho/morpho-warnings'

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql'

const GetMarketDocument = gql`
  query GetSingleMorphoMarket($marketId: String!, $chainId: Int!) {
    marketById(marketId: $marketId, chainId: $chainId) {
      marketId
      uniqueKey: marketId
      lltv
      whitelisted
      oracleAddress
      irmAddress
      loanAsset { address symbol name decimals price { usd } }
      collateralAsset { address symbol name decimals priceUsd price { usd } }
      supplyingVaults { address }
      supplyingVaultV2s { address }
      morphoBlue { chain { id } }
      badDebt { usd }
      realizedBadDebt { usd }
      warnings { type level }

      state {
        supplyAssetsUsd
        borrowAssetsUsd
        utilization
        # this value is awesome, it's the variation of the collateral price over the last 24 hours
        dailyPriceVariation

        # Collateral amounts for price fallback
        collateralAssets
        collateralAssetsUsd

        # Base (ex-rewards) instantaneous + aggregates
        supplyApy
        avgSupplyApy
        dailySupplyApy
        weeklySupplyApy

        # Net (incl rewards) instantaneous + aggregates
        netSupplyApy
        avgNetSupplyApy
        dailyNetSupplyApy
        weeklyNetSupplyApy

        # IRM state / curve anchor
        apyAtTarget
        rateAtTarget

        # Borrow side (kept for completeness)
        borrowApy
        netBorrowApy
        avgNetBorrowApy
        dailyNetBorrowApy
        weeklyNetBorrowApy
      }
    }
  }
`

export interface SingleMorphoMarket {
  marketId: string
  uniqueKey: string
  lltv: string // format 770000000000000000
  whitelisted: boolean
  oracleAddress: string
  irmAddress: string
  loanAsset: {
    address: string
    symbol: string
    name: string
    decimals: number
    price: { usd: number } | null
  }
  collateralAsset: {
    address: string
    symbol: string
    name: string
    decimals: number
    priceUsd: number | null
    price: { usd: number } | null
  }
  supplyingVaults: { address: string }[]
  supplyingVaultV2s: { address: string }[]
  morphoBlue: {
    chain: { id: number }
  }
  badDebt: {
    usd: number
  }
  realizedBadDebt: {
    usd: number
  }
  warnings?: Array<{
    type: string
    level: 'YELLOW' | 'RED'
  }>
  state: {
    supplyAssetsUsd: number
    borrowAssetsUsd: number
    utilization: number
    dailyPriceVariation: number
    collateralAssets: string | null
    collateralAssetsUsd: number | null
    supplyApy: number
    avgSupplyApy: number
    dailySupplyApy: number
    weeklySupplyApy: number
    netSupplyApy: number
    avgNetSupplyApy: number
    dailyNetSupplyApy: number
    weeklyNetSupplyApy: number
    apyAtTarget: number
    rateAtTarget: string | number
    borrowApy: number
    netBorrowApy: number
    avgNetBorrowApy: number
    dailyNetBorrowApy: number
    weeklyNetBorrowApy: number
  }
}

export function useMarketQuery(uniqueKey?: string, chainId?: number) {
  return useQuery({
    queryKey: ['market', uniqueKey, chainId],
    queryFn: async () => {
      if (!uniqueKey || !chainId)
        return null
      const { marketById } = await request(
        MORPHO_API_URL,
        GetMarketDocument,
        {
          marketId: uniqueKey,
          chainId,
        },
      )
      const market = marketById as SingleMorphoMarket | null
      if (!market)
        return null
      if (isOracleMisconfiguredWarning(market.warnings))
        return null
      return market
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: STALE_TIME_SHORT_MS,
  })
}
