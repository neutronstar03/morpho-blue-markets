import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { Button } from '~/components/ui/button'
import {
  clearCollateralLocallyBlacklisted,
  isCollateralLocallyBlacklisted,
  setCollateralLocallyBlacklisted,
  useLocalCollateralBlacklistVersion,
} from '~/lib/local-collateral-blacklist'

interface LocalCollateralBlacklistControlProps {
  market: SingleMorphoMarket
  isOpen: boolean
}

export function LocalCollateralBlacklistControl({ market, isOpen }: LocalCollateralBlacklistControlProps) {
  const version = useLocalCollateralBlacklistVersion()

  const chainId = market.morphoBlue.chain.id
  const collateralAddress = market.collateralAsset.address
  const collateralSymbol = market.collateralAsset.symbol

  const isBlacklisted = useMemo(() => {
    void version
    return isCollateralLocallyBlacklisted(chainId, collateralAddress)
  }, [chainId, collateralAddress, version])

  const onToggleBlacklist = () => {
    if (isBlacklisted) {
      clearCollateralLocallyBlacklisted(chainId, collateralAddress)
      return
    }
    setCollateralLocallyBlacklisted(chainId, collateralAddress)
  }

  return (
    isOpen
      ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Advanced
            </p>
            <p className="mt-2 text-sm text-gray-200">
              Mark this collateral as a local blacklist, so it never gets suggested again. Reversible.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={isBlacklisted ? 'outline' : 'default'}
                className={isBlacklisted
                  ? 'border-green-700/30 bg-green-900/10 text-green-300 hover:bg-green-900/20'
                  : 'bg-red-600 text-white hover:bg-red-700'}
                onClick={onToggleBlacklist}
              >
                {isBlacklisted ? 'Remove local blacklist' : `Blacklist ${collateralSymbol}`}
              </Button>
              <span className="text-xs text-gray-500 font-mono break-all">{collateralAddress}</span>
            </div>
          </div>
        )
      : null
  )
}
