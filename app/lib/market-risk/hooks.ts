import type { MarketRiskInput } from './types'
import { useMemo, useSyncExternalStore } from 'react'
import { useCollateralWhitelistVersion } from '../collateral-whitelist'
import { useMarketBlacklistVersion } from '../market-blacklist'
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
  const blacklistVersion = useMarketBlacklistVersion()
  return useMemo(() => {
    void version
    void whitelistVersion
    void blacklistVersion
    return getMarketRisk(market)
  }, [market, version, whitelistVersion, blacklistVersion])
}

export function useExecutionGuard(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  return useMemo(() => {
    void version
    void whitelistVersion
    void blacklistVersion
    return getExecutionGuard(markets)
  }, [markets, version, whitelistVersion, blacklistVersion])
}
