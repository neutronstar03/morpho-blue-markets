import type { FormattedMarket } from '../../lib/hooks/use-market'

const formatAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString()

interface MarketDetailsProps {
  market: FormattedMarket
}

export function MarketDetails({ market }: MarketDetailsProps) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Market Details</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assets */}
        <div>
          <h4 className="font-medium text-gray-200 mb-3">Assets</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Loan Token:</span>
              <div className="text-right">
                <p className="font-medium text-white">{market.loanAsset.symbol}</p>
                {market.loanAsset.name && (
                  <p className="text-sm text-gray-400">{market.loanAsset.name}</p>
                )}
                <p className="font-mono text-xs text-gray-500">
                  {formatAddress(market.loanAsset.address)}
                </p>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Collateral Token:</span>
              <div className="text-right">
                <p className="font-medium text-white">{market.collateralAsset.symbol}</p>
                {market.collateralAsset.name && (
                  <p className="text-sm text-gray-400">{market.collateralAsset.name}</p>
                )}
                <p className="font-mono text-xs text-gray-500">
                  {formatAddress(market.collateralAsset.address)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Parameters */}
        <div>
          <h4 className="font-medium text-gray-200 mb-3">Parameters</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Oracle:</span>
              <span className="font-mono text-xs text-gray-300">{formatAddress(market.oracleAddress)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Interest Rate Model:</span>
              <span className="font-mono text-xs text-gray-300">{formatAddress(market.irmAddress)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Whitelisted:</span>
              <span className="font-medium text-white">{market.whitelisted ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Creation Info */}
      <div className="mt-6 pt-6 border-t border-gray-700">
        <div className="flex justify-between text-sm text-gray-400">
          <span>Created: {formatDate(market.createdAt)}</span>
          <span>Borrow APY: {market.borrowApyFormatted}</span>
        </div>
      </div>
    </div>
  )
}
