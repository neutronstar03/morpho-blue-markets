import type { MarketData, MarketSide } from './shared'
import { Link } from 'react-router-dom'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { formatMarketSize } from '~/lib/formatters'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { getMarketSideColors } from './shared'

interface MarketTableProps {
  markets: MarketData[]
  isLoading: boolean
  rateType: MarketSide
  immediateAprByMarketKey: Record<string, { apr?: number, borrowApr?: number, isLive: boolean }>
  canComputeLiveApr: boolean
  liveChainId?: number
  hideChainColumn: boolean
  riskStatusByKey: Record<string, 'white' | 'blue' | 'yellow' | 'purple' | 'black' | undefined>
}

export function MarketTable({
  markets,
  isLoading,
  rateType,
  immediateAprByMarketKey,
  canComputeLiveApr,
  liveChainId,
  hideChainColumn,
  riskStatusByKey,
}: MarketTableProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p className="text-white">Loading...</p>
      </div>
    )
  }
  const colors = getMarketSideColors(rateType)

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className={colors.background}>
          <tr>
            <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
            {!hideChainColumn && (
              <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Chain</th>
            )}
            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Size $</th>
            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              <span className="sm:hidden">Bef 90%</span>
              <span className="hidden sm:inline">before 90%</span>
            </th>
            <th scope="col" className="hidden sm:table-cell px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">usage %</th>
            <th scope="col" className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Recent APY</th>
            <th scope="col" className="px-2 sm:px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
              <span className="sm:hidden">Imm APR</span>
              <span className="hidden sm:inline">Immediate APR</span>
            </th>
          </tr>
        </thead>
        <tbody className={`${colors.backgroundLight} divide-y divide-gray-700`}>
          {markets.map(market => (
            <tr
              key={market.id}
              className={`even:bg-white/[0.02] ${rateType === 'supply' ? 'hover:bg-gray-700/70' : 'hover:bg-orange-900/60'} transition-colors relative`}
            >
              <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/market/${market.id}/${market.chainId}`}
                    className="hover:opacity-90 transition-opacity"
                  >
                    <MarketRiskText status={riskStatusByKey[`${market.chainId}:${market.id.toLowerCase()}`]}>
                      {market.marketLabel}
                    </MarketRiskText>
                  </Link>
                  <a
                    href={morphoAppMarketUrl(market.chainName, market.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-blue-400 transition-colors relative z-10 flex items-center"
                    title="Open in Morpho official UI"
                  >
                    <LinkNewWindow className="w-5 h-5" />
                  </a>
                </div>
              </td>
              {!hideChainColumn && (
                <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-400">{market.chainName}</td>
              )}
              <td className="px-2 sm:px-3 py-4 whitespace-nowrap text-right text-sm text-white">{formatMarketSize(market.marketSizeUsd ?? undefined)}</td>
              <td className="px-2 sm:px-3 py-4 whitespace-nowrap text-right text-sm text-white">{market.beforeTarget}</td>
              <td className="hidden sm:table-cell px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-white">{market.utilizationPct}</td>
              <td className={`px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {`${((rateType === 'supply' ? market.netSupplyApy : market.netBorrowApy) * 100).toFixed(2)}%`}
              </td>
              <td className={`px-2 sm:px-6 py-4 whitespace-nowrap text-right text-sm ${colors.rateText}`}>
                {(() => {
                  const entry = immediateAprByMarketKey[market.id]
                  const immediate = rateType === 'supply' ? entry?.apr : entry?.borrowApr
                  if (!canComputeLiveApr || liveChainId == null || market.chainId !== liveChainId)
                    return '—'
                  if (!entry?.isLive || immediate == null)
                    return '—'
                  return `${(immediate * 100).toFixed(2)}%`
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
