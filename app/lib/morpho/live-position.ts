import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import type { UserPosition } from '~/lib/hooks/graphql/use-user-positions'

import { normalizeMorphoMarketState } from '~/lib/morpho/market-state'
import { getSuppliedAssetsFromShares, hasVisibleSuppliedAssets } from '~/lib/morpho/position-visibility'
import { projectMorphoMarketAccrual } from '~/lib/morpho/project-accrual'

export interface LiveMarketPosition {
  market: {
    uniqueKey: string
    irmAddress: string
    oracleAddress?: string
    lltv?: string
    warnings?: Array<{
      type: string
      level: 'YELLOW' | 'RED'
    }>
    loanAsset: {
      symbol: string
      decimals: number | null
      address: string
      price?: {
        usd?: number | null
      } | null
    }
    collateralAsset: {
      symbol: string
      decimals: number | null
      address: string
    }
    state: {
      netSupplyApy: number
      utilization: number
      supplyAssets: string
      supplyShares: string
      supplyAssetsUsd?: number | null
      rewards?: Array<{
        supplyApr?: number | null
        id: string
        asset: {
          address: string
          symbol: string
          decimals?: number | null
        }
      }> | null
    }
  }
  userState: {
    supplyShares: bigint
    borrowShares: bigint
    collateral: bigint
  }
  liveState?: {
    suppliedAssets: bigint
    projectedSuppliedAssets?: bigint
    secondsSinceLastMarketUpdate?: bigint
  }
}

type LiveMarketMetadata = Pick<UserPosition['market'], 'uniqueKey' | 'irmAddress' | 'lltv' | 'warnings' | 'loanAsset' | 'collateralAsset'> & {
  oracleAddress?: string
  state: Pick<UserPosition['market']['state'], 'netSupplyApy' | 'utilization' | 'supplyAssets' | 'supplyShares' | 'supplyAssetsUsd' | 'rewards'>
}

export function liveMarketMetadataFromGraphPosition(position: UserPosition): LiveMarketMetadata {
  return {
    uniqueKey: position.market.uniqueKey,
    irmAddress: position.market.irmAddress,
    oracleAddress: position.market.oracle?.address ?? undefined,
    lltv: position.market.lltv ?? undefined,
    warnings: position.market.warnings,
    loanAsset: position.market.loanAsset,
    collateralAsset: position.market.collateralAsset,
    state: position.market.state,
  }
}

export function liveMarketMetadataFromMarket(market: SingleMorphoMarket): LiveMarketMetadata {
  return {
    uniqueKey: market.uniqueKey,
    irmAddress: market.irmAddress,
    oracleAddress: market.oracleAddress,
    lltv: market.lltv,
    warnings: market.warnings,
    loanAsset: market.loanAsset,
    collateralAsset: market.collateralAsset,
    state: {
      netSupplyApy: market.state.netSupplyApy,
      utilization: market.state.utilization,
      supplyAssets: '0',
      supplyShares: '0',
      supplyAssetsUsd: market.state.supplyAssetsUsd,
      rewards: null,
    },
  }
}

export function buildLiveMarketPosition(args: {
  metadata: LiveMarketMetadata
  graphUserState?: UserPosition['state']
  positionResult?: unknown
  marketResult?: unknown
  rateAtTarget?: bigint
  projectionTimestamp: number
}): LiveMarketPosition | null {
  const { metadata, graphUserState, positionResult, marketResult, rateAtTarget, projectionTimestamp } = args

  let supplyShares = BigInt(graphUserState?.supplyShares || '0')
  let borrowShares = BigInt(graphUserState?.borrowShares || '0')
  let collateral = BigInt(graphUserState?.collateral || '0')

  let marketSupplyAssets = metadata.state.supplyAssets
  let marketSupplyShares = metadata.state.supplyShares
  let marketStateSupplyUsd = metadata.state.supplyAssetsUsd
  let marketUtilization = metadata.state.utilization
  let suppliedAssets: bigint | undefined
  let projectedSuppliedAssets: bigint | undefined
  let secondsSinceLastMarketUpdate: bigint | undefined

  if (Array.isArray(positionResult)) {
    const [ss, bs, col] = positionResult as unknown as readonly [bigint, bigint, bigint]
    supplyShares = ss
    borrowShares = bs
    collateral = col
  }

  const marketState = normalizeMorphoMarketState(marketResult)
  if (marketState) {
    suppliedAssets = getSuppliedAssetsFromShares({
      userSupplyShares: supplyShares,
      totalSupplyAssets: marketState.totalSupplyAssets,
      totalSupplyShares: marketState.totalSupplyShares,
    })

    const timestamp = BigInt(projectionTimestamp)
    const projectedMarketState = rateAtTarget == null
      ? marketState
      : projectMorphoMarketAccrual({
          marketId: metadata.uniqueKey as `0x${string}`,
          market: marketState,
          rateAtTarget,
          timestamp,
        })

    marketSupplyAssets = projectedMarketState.totalSupplyAssets.toString()
    marketSupplyShares = projectedMarketState.totalSupplyShares.toString()
    marketUtilization = projectedMarketState.totalSupplyAssets > 0n
      ? Number(projectedMarketState.totalBorrowAssets) / Number(projectedMarketState.totalSupplyAssets)
      : 0
    projectedSuppliedAssets = getSuppliedAssetsFromShares({
      userSupplyShares: supplyShares,
      totalSupplyAssets: projectedMarketState.totalSupplyAssets,
      totalSupplyShares: projectedMarketState.totalSupplyShares,
    })
    secondsSinceLastMarketUpdate = timestamp > marketState.lastUpdate ? timestamp - marketState.lastUpdate : 0n

    const loanPriceUsd = metadata.loanAsset.price?.usd
    if (loanPriceUsd != null) {
      const decimals = metadata.loanAsset.decimals ?? 18
      const scale = 10 ** decimals
      marketStateSupplyUsd = Number(projectedMarketState.totalSupplyAssets) / scale * loanPriceUsd
    }
  }

  const hasVisibleSupply = hasVisibleSuppliedAssets({
    userSupplyShares: supplyShares,
    totalSupplyAssets: marketSupplyAssets,
    totalSupplyShares: marketSupplyShares,
  })
  const hasPosition = hasVisibleSupply || borrowShares > 0n || collateral > 0n
  if (!hasPosition)
    return null

  return {
    market: {
      uniqueKey: metadata.uniqueKey,
      irmAddress: metadata.irmAddress,
      oracleAddress: metadata.oracleAddress,
      lltv: metadata.lltv,
      warnings: metadata.warnings,
      loanAsset: metadata.loanAsset,
      collateralAsset: metadata.collateralAsset,
      state: {
        netSupplyApy: metadata.state.netSupplyApy ?? 0,
        utilization: marketUtilization,
        supplyAssets: marketSupplyAssets,
        supplyShares: marketSupplyShares,
        supplyAssetsUsd: marketStateSupplyUsd,
        rewards: metadata.state.rewards,
      },
    },
    userState: {
      supplyShares,
      borrowShares,
      collateral,
    },
    liveState: {
      suppliedAssets: suppliedAssets ?? getSuppliedAssetsFromShares({
        userSupplyShares: supplyShares,
        totalSupplyAssets: marketSupplyAssets,
        totalSupplyShares: marketSupplyShares,
      }),
      projectedSuppliedAssets,
      secondsSinceLastMarketUpdate,
    },
  }
}
