import type { MarketRiskInput, MarketRiskStatus } from './types'
import { useMemo, useSyncExternalStore } from 'react'
import { useCollateralWhitelistVersion } from '../collateral-whitelist'
import { useReviewedCollateralKeySet } from '../hooks/use-reviewed-collaterals'
import { useMarketBlacklistVersion } from '../market-blacklist'
import { getCollateralDecisionsVersion, subscribeCollateralDecisions } from './collateral-decisions'
import { getExecutionGuard, getMarketRisk } from './market-risk'

interface CollateralReviewCandidate {
  key: string
  chainId: number
  collateralAddress: string
}

function normalizeAddress(address?: string | null) {
  const s = (address ?? '').trim().toLowerCase()
  return /^0x[a-f0-9]{40}$/.test(s) ? s : ''
}

function reviewCandidateKey(chainId?: number, collateralAddress?: string | null) {
  const normalized = normalizeAddress(collateralAddress)
  return chainId && normalized ? `${chainId}:${normalized}` : ''
}

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
  }, [blacklistVersion, market, version, whitelistVersion])
}

export function useMarketRiskStatusMap(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
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

export function useMarketRiskStatusMapWithCollateralReviews(markets: MarketRiskInput[]) {
  const version = useCollateralDecisionsVersion()
  const whitelistVersion = useCollateralWhitelistVersion()
  const blacklistVersion = useMarketBlacklistVersion()
  const candidates = useMemo<CollateralReviewCandidate[]>(() => {
    void version
    void whitelistVersion
    void blacklistVersion

    const seen = new Set<string>()
    const out: CollateralReviewCandidate[] = []
    for (const market of markets) {
      const key = reviewCandidateKey(market.chainId, market.collateralAssetAddress)
      if (!key || seen.has(key))
        continue

      const baseRisk = getMarketRisk({ ...market, hasCollateralReview: false })
      if (baseRisk.status !== 'yellow')
        continue

      const collateralAddress = normalizeAddress(market.collateralAssetAddress)
      if (!market.chainId || !collateralAddress)
        continue

      seen.add(key)
      out.push({
        key,
        chainId: market.chainId,
        collateralAddress,
      })
    }
    return out
  }, [blacklistVersion, markets, version, whitelistVersion])

  const candidateChainId = useMemo(() => {
    if (candidates.length === 0)
      return undefined

    const chainId = candidates[0].chainId
    return candidates.every(candidate => candidate.chainId === chainId) ? chainId : undefined
  }, [candidates])

  const reviewedCollateralKeys = useReviewedCollateralKeySet({
    chainId: candidateChainId,
    enabled: candidates.length > 0,
  })

  const reviewedKeys = useMemo(() => {
    const out = new Set<string>()
    const keySet = reviewedCollateralKeys.data
    if (!keySet)
      return out

    candidates.forEach((candidate) => {
      if (keySet.has(candidate.key))
        out.add(candidate.key)
    })
    return out
  }, [candidates, reviewedCollateralKeys.data])

  const marketsWithReviewSignals = useMemo(() => {
    if (reviewedKeys.size === 0)
      return markets

    return markets.map((market) => {
      const key = reviewCandidateKey(market.chainId, market.collateralAssetAddress)
      if (!key || !reviewedKeys.has(key))
        return market
      return { ...market, hasCollateralReview: true }
    })
  }, [markets, reviewedKeys])

  return useMarketRiskStatusMap(marketsWithReviewSignals)
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
  }, [blacklistVersion, markets, version, whitelistVersion])
}
