import type { MarketRiskInput, MarketRiskStatus } from './types'
import { useMemo, useSyncExternalStore } from 'react'
import { useCollateralWhitelistVersion } from '../collateral-whitelist'
import { useMarketBlacklistVersion } from '../market-blacklist'
import { useSharedDecisionsVersion } from '../reviews/use-shared-decisions'
import { getCollateralDecisionsVersion, subscribeCollateralDecisions } from './collateral-decisions'
import { getExecutionGuard, getMarketRisk } from './market-risk'

export function useCollateralDecisionsVersion() {
  return useSyncExternalStore(
    subscribeCollateralDecisions,
    () => getCollateralDecisionsVersion(),
    () => 0,
  )
}

export function useMarketRiskStatus(market: MarketRiskInput) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const sharedVersion = useSharedDecisionsVersion()
  const blacklistVersion = `${useMarketBlacklistVersion()}:${sharedVersion}`
  return useMemo(() => {
    void version
    void whitelistVersion
    void blacklistVersion
    return getMarketRisk(market)
  }, [blacklistVersion, market, version, whitelistVersion])
}

export function useMarketRiskStatusMap(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const sharedVersion = useSharedDecisionsVersion()
  const blacklistVersion = `${useMarketBlacklistVersion()}:${sharedVersion}`
  return useMemo<Record<string, MarketRiskStatus | undefined>>(() => {
    void version
    void whitelistVersion
    void blacklistVersion
    const out: Record<string, MarketRiskStatus | undefined> = {}
    for (const market of markets) {
      if (!market.chainId || !market.uniqueKey)
        continue
      const key = `${market.chainId}:${market.uniqueKey.toLowerCase()}`
      out[key] = getMarketRisk(market).status
    }
    return out
  }, [blacklistVersion, markets, version, whitelistVersion])
}

// Shared decisions update the same risk function used by detail, optimizer and batch flows.
export function useMarketRiskStatusMapWithCollateralReviews(markets: MarketRiskInput[]) {
  return useMarketRiskStatusMap(markets)
}

export function useExecutionGuard(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const sharedVersion = useSharedDecisionsVersion()
  const blacklistVersion = `${useMarketBlacklistVersion()}:${sharedVersion}`
  return useMemo(() => {
    void version
    void whitelistVersion
    void blacklistVersion
    return getExecutionGuard(markets)
  }, [blacklistVersion, markets, version, whitelistVersion])
}
