import { useQuery } from '@tanstack/react-query'
import { gql, request } from 'graphql-request'
import { isMarketBlacklisted } from '~/lib/market-blacklist'

const MORPHO_API_URL = 'https://blue-api.morpho.org/graphql'

const GetMarketDocument = gql`
  query GetSingleMorphoMarket($uniqueKey: String!, $chainId: Int!) {
    marketByUniqueKey(uniqueKey: $uniqueKey, chainId: $chainId) {
      uniqueKey
      lltv
      whitelisted
      oracleAddress
      irmAddress
      loanAsset { address symbol name decimals }
      collateralAsset { address symbol name decimals }
      supplyingVaults { address }
      morphoBlue { chain { id } }
      badDebt { usd }
      realizedBadDebt { usd }

      state {
        supplyAssetsUsd
        borrowAssetsUsd
        utilization
        # this value is awesome, it's the variation of the collateral price over the last 24 hours
        dailyPriceVariation

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
  }
  collateralAsset: {
    address: string
    symbol: string
    name: string
    decimals: number
  }
  supplyingVaults: { address: string }[]
  morphoBlue: {
    chain: { id: number }
  }
  badDebt: {
    usd: number
  }
  realizedBadDebt: {
    usd: number
  }
  state: {
    supplyAssetsUsd: number
    borrowAssetsUsd: number
    utilization: number
    dailyPriceVariation: number
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
      const { marketByUniqueKey } = await request(
        MORPHO_API_URL,
        GetMarketDocument,
        {
          uniqueKey,
          chainId,
        },
      )
      const market = marketByUniqueKey as SingleMorphoMarket | null
      if (!market)
        return null
      if (isMarketBlacklisted({
        uniqueKey: market.uniqueKey,
        loanAssetAddress: market.loanAsset?.address,
        collateralAssetAddress: market.collateralAsset?.address,
        chainId: market.morphoBlue?.chain?.id ?? chainId,
      })) {
        return null
      }
      return market
    },
    enabled: !!uniqueKey && !!chainId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
