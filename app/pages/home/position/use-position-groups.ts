import type { PositionGroup } from './position-types'
import type { LiveMarketPosition } from '~/lib/hooks/rpc/use-live-market-positions'
import { useMemo } from 'react'
import { getPositionPrincipalUsd, getPositionYearlyUsd } from './position-utils'

export function usePositionGroups(
  visiblePositions: LiveMarketPosition[],
  chainId: number | undefined,
  aprByMarketKey: Record<string, { apr?: number }>,
) {
  return useMemo<PositionGroup[]>(() => {
    const groups = new Map<string, PositionGroup>()

    // Group by loan asset and rank by current supplied value, not by yearly yield.
    for (const position of visiblePositions) {
      const loanAssetAddress = position.market.loanAsset.address.toLowerCase()
      const key = `${chainId ?? 'unknown'}:${loanAssetAddress}`
      const totalValueUsd = getPositionPrincipalUsd(position) ?? 0
      const yearlyUsd = getPositionYearlyUsd(position, aprByMarketKey[position.market.uniqueKey]?.apr) ?? 0

      const existing = groups.get(key)
      if (existing) {
        existing.positions.push(position)
        existing.totalValueUsd += totalValueUsd
        existing.yearlyUsd += yearlyUsd
        continue
      }

      groups.set(key, {
        key,
        loanAssetSymbol: position.market.loanAsset.symbol,
        loanAssetAddress,
        totalValueUsd,
        yearlyUsd,
        positions: [position],
      })
    }

    const out = [...groups.values()]

    for (const group of out) {
      group.positions.sort((a, b) => {
        const aValueUsd = getPositionPrincipalUsd(a) ?? 0
        const bValueUsd = getPositionPrincipalUsd(b) ?? 0
        if (aValueUsd === bValueUsd)
          return a.market.uniqueKey.localeCompare(b.market.uniqueKey)
        return bValueUsd - aValueUsd
      })
    }

    out.sort((a, b) => {
      if (a.totalValueUsd === b.totalValueUsd)
        return a.loanAssetSymbol.localeCompare(b.loanAssetSymbol)
      return b.totalValueUsd - a.totalValueUsd
    })

    return out
  }, [aprByMarketKey, chainId, visiblePositions])
}
