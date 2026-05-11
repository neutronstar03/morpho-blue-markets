import type { ChainPositionPillItem } from './position-types'
import type { CrossChainUserPosition } from '~/lib/hooks/graphql/use-user-positions'
import { useMemo } from 'react'
import { getSupportedChainName } from '~/lib/addresses'
import { CHAIN_ICON_BY_ID } from '~/lib/chain-icons'
import { isMarketIdBlacklisted, useMarketBlacklistVersion } from '~/lib/market-blacklist'

export function usePositionChainPills(crossChainPositions: CrossChainUserPosition[] | undefined, currentChainId?: number) {
  const blacklistVersion = useMarketBlacklistVersion()
  return useMemo<ChainPositionPillItem[]>(() => {
    void blacklistVersion
    const counts = new Map<number, number>()

    for (const position of (crossChainPositions ?? [])) {
      if (isMarketIdBlacklisted(position.uniqueKey, position.chainId))
        continue
      counts.set(position.chainId, (counts.get(position.chainId) ?? 0) + 1)
    }

    return [...counts.entries()]
      .filter(([chainId, count]) => count > 0 && chainId !== currentChainId)
      .map(([chainId, count]) => ({
        chainId,
        count,
        label: getSupportedChainName(chainId),
        Icon: CHAIN_ICON_BY_ID[chainId],
      }))
      .sort((a, b) => {
        if (a.count === b.count)
          return a.label.localeCompare(b.label)
        return b.count - a.count
      })
  }, [blacklistVersion, crossChainPositions, currentChainId])
}
