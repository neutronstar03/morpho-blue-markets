import type { FormattedMarket } from '../../lib/hooks/use-market'

const formatAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

interface MarketHeaderProps {
  market: FormattedMarket
}

export function MarketHeader({ market }: MarketHeaderProps) {
  return (
    <div className="p-6 border-b border-gray-700">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {market.name}
          </h2>
          <p className="text-gray-300">{market.pair}</p>
          <p className="text-sm text-gray-400 mt-1">{market.chainName}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-400">Market ID</p>
          <a
            href={`https://app.morpho.org/${market.chainName.toLowerCase()}/market/${market.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-gray-300 hover:text-blue-400 transition-colors"
          >
            {formatAddress(market.id)}
          </a>
        </div>
      </div>
    </div>
  )
}
