import type { MarketRiskInput } from './types'
import { useMemo, useSyncExternalStore } from 'react'
import { useCollateralWhitelistVersion } from '../collateral-whitelist'
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
  return useMemo(() => {
    void version
    void whitelistVersion
    return getMarketRisk(market)
  }, [market, version, whitelistVersion])
}

export function useExecutionGuard(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  return useMemo(() => {
    void version
    void whitelistVersion
    return getExecutionGuard(markets)
  }, [markets, version, whitelistVersion])
}
