// Market-page controls for local collateral, oracle, and lost-value exclusions.
import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '~/components/ui/button'
import { useViewingWallet } from '~/lib/contexts/viewing-wallet'
import { useUserPosition } from '~/lib/hooks/rpc/use-morpho'
import {
  clearCollateralLocallyExcluded,
  clearMarketLocallyMarkedLostValue,
  clearOracleLocallyExcluded,
  setCollateralLocallyExcluded,
  setMarketLocallyMarkedLostValue,
  setOracleLocallyExcluded,
  useLocalMarketExclusionStatus,
} from '~/lib/local-market-exclusions'
import { getOracleProvider } from '~/lib/oracle-providers'

interface LocalCollateralBlacklistControlProps {
  market: SingleMorphoMarket
  isOpen: boolean
}

export function LocalCollateralBlacklistControl({ market, isOpen }: LocalCollateralBlacklistControlProps) {
  const { address: connectedAddress } = useAccount()
  const { viewingAddress } = useViewingWallet()
  const address = viewingAddress ?? connectedAddress

  const chainId = market.morphoBlue.chain.id
  const marketUniqueKey = market.uniqueKey
  const collateralAddress = market.collateralAsset.address
  const collateralSymbol = market.collateralAsset.symbol
  const collateralName = market.collateralAsset.name
  const oracleAddress = market.oracleAddress
  const { data: position, isLoading: isLoadingPosition } = useUserPosition(marketUniqueKey, address)
  const {
    isCollateralExcluded: isCollateralBlacklisted,
    isOracleExcluded: isOracleBlacklisted,
    isMarketMarkedLostValue: isWrittenOff,
  } = useLocalMarketExclusionStatus({
    chainId,
    collateralAddress,
    oracleAddress,
    marketUniqueKey,
  })

  const hasOpenPosition = useMemo(() => {
    if (!position)
      return false
    const [supplyShares = 0n, borrowShares = 0n, collateral = 0n] = position
    return supplyShares > 0n || borrowShares > 0n || collateral > 0n
  }, [position])

  const onToggleCollateralBlacklist = () => {
    if (isCollateralBlacklisted) {
      clearCollateralLocallyExcluded(chainId, collateralAddress)
      return
    }
    setCollateralLocallyExcluded(chainId, collateralAddress, {
      symbol: collateralSymbol,
      name: collateralName,
    })
  }

  const onToggleOracleBlacklist = () => {
    if (isOracleBlacklisted) {
      clearOracleLocallyExcluded(chainId, oracleAddress)
      return
    }
    const provider = getOracleProvider(chainId, oracleAddress)
    setOracleLocallyExcluded(chainId, oracleAddress, {
      provider: provider ?? undefined,
      collateralSymbol,
    })
  }

  const onToggleWriteoff = () => {
    if (isWrittenOff) {
      clearMarketLocallyMarkedLostValue(chainId, marketUniqueKey)
      return
    }

    setMarketLocallyMarkedLostValue(chainId, marketUniqueKey, {
      loanAssetSymbol: market.loanAsset.symbol,
      collateralAssetSymbol: market.collateralAsset.symbol,
      loanAssetAddress: market.loanAsset.address,
      collateralAssetAddress: market.collateralAsset.address,
    })
  }

  const canShowWriteoffControl = isWrittenOff || hasOpenPosition

  return (
    isOpen
      ? (
          <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Advanced
            </p>

            <div>
              <p className="text-sm font-medium text-gray-200">Collateral blacklist</p>
              <p className="mt-1 text-sm text-gray-300">
                Mark this collateral as a local blacklist, so it never gets suggested again. Reversible.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isCollateralBlacklisted ? 'outline' : 'default'}
                  className={isCollateralBlacklisted
                    ? 'border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20'
                    : 'bg-red-600 text-white hover:bg-red-700'}
                  onClick={onToggleCollateralBlacklist}
                >
                  {isCollateralBlacklisted ? 'Remove local blacklist' : `Blacklist ${collateralSymbol}`}
                </Button>
                <span className="text-xs text-gray-500 font-mono break-all">{collateralAddress}</span>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="text-sm font-medium text-gray-200">Oracle blacklist</p>
              <p className="mt-1 text-sm text-gray-300">
                Blacklist this oracle address. All markets using it will be hidden from suggestions. Reversible.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isOracleBlacklisted ? 'outline' : 'default'}
                  className={isOracleBlacklisted
                    ? 'border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20'
                    : 'bg-red-600 text-white hover:bg-red-700'}
                  onClick={onToggleOracleBlacklist}
                >
                  {isOracleBlacklisted ? 'Remove oracle blacklist' : 'Blacklist oracle'}
                </Button>
                <span className="text-xs text-gray-500 font-mono break-all">{oracleAddress}</span>
              </div>
            </div>

            {canShowWriteoffControl && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-sm font-medium text-gray-200">Lost value market</p>
                <p className="mt-1 text-sm text-gray-300">
                  Mark this market as lost value. MBM will hide it from portfolio totals, batch withdrawal, and deposit suggestions. Reversible.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isWrittenOff ? 'outline' : 'default'}
                    className={isWrittenOff
                      ? 'border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20'
                      : 'bg-red-600 text-white hover:bg-red-700'}
                    onClick={onToggleWriteoff}
                  >
                    {isWrittenOff ? 'Restore market' : 'Mark as lost value'}
                  </Button>
                  <span className="text-xs text-gray-500 font-mono break-all">{marketUniqueKey}</span>
                </div>
              </div>
            )}
            {!canShowWriteoffControl && !isLoadingPosition && address && (
              <p className="border-t border-white/10 pt-4 text-xs text-gray-500">
                Lost value control appears here when the viewed wallet has an open position in this market.
              </p>
            )}
          </div>
        )
      : null
  )
}
