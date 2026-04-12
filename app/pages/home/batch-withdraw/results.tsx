import type { BatchWithdrawPlanState, LoanAssetOption } from './shared'
import { createSearchParams, Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { formatBigintShort } from '~/lib/formatters'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { pctFromWad, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'

interface BatchWithdrawResultsProps {
  plan: BatchWithdrawPlanState
  selectedOption: LoanAssetOption
  symbol: string
  plannedTotal: bigint
  chainId?: number
  chainNameForLinks?: string
}

export function BatchWithdrawResults({
  plan,
  selectedOption,
  symbol,
  plannedTotal,
  chainId,
  chainNameForLinks,
}: BatchWithdrawResultsProps) {
  return (
    <>
      {plan.remaining > 0n && (
        <div className="text-sm text-orange-200 border border-orange-900/40 bg-orange-950/20 rounded-md p-3">
          Not enough available liquidity to withdraw the full amount. Planned:
          {' '}
          {formatBigintShort(plannedTotal, selectedOption.decimals)}
          {' '}
          {symbol}
          .
          {' '}
          Remaining:
          {' '}
          {formatBigintShort(plan.remaining, selectedOption.decimals)}
          {' '}
          {symbol}
          .
        </div>
      )}

      {plan.overWithdrawAssets > 0n && (
        <div className="text-xs text-gray-400">
          Due to rounding, the plan may withdraw slightly more than requested:
          {' '}
          {formatBigintShort(plan.overWithdrawAssets, selectedOption.decimals)}
          {' '}
          {symbol}
          .
        </div>
      )}

      <div className="overflow-x-auto border border-gray-700 rounded-md">
        <table className="min-w-full divide-y divide-gray-700" data-testid="batch-withdraw-result-table">
          <thead className="bg-gray-800/40">
            <tr>
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">APR</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Supplied</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Max</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Planned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 bg-gray-900/20">
            {plan.items.map((p) => {
              const marketLabel = `${p.collateralSymbol} / ${symbol}`
              const deepLinkAmount = trimTrailingZerosDecimalString(formatUnits(p.plannedWithdrawAssets, selectedOption.decimals))
              const deepLinkSearch = p.plannedWithdrawAssets > 0n && deepLinkAmount
                ? createSearchParams({
                    tab: 'withdraw',
                    unit: 'asset',
                    amount: deepLinkAmount,
                  }).toString()
                : ''

              return (
                <tr key={p.marketId}>
                  <td className="px-3 sm:px-4 py-2 text-sm text-white">
                    <div className="flex items-center gap-2">
                      {chainId
                        ? (
                            <Link
                              to={{
                                pathname: `/market/${p.marketId}/${chainId}`,
                                search: deepLinkSearch ? `?${deepLinkSearch}` : '',
                              }}
                              className="hover:text-blue-400 transition-colors"
                              data-umami-event="market_navigate"
                              data-umami-data-source="batch_withdraw"
                            >
                              {marketLabel}
                            </Link>
                          )
                        : (
                            <span>{marketLabel}</span>
                          )}
                      {chainNameForLinks && (
                        <a
                          href={morphoAppMarketUrl(chainNameForLinks, p.marketId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-blue-400 transition-colors flex items-center"
                          title="Open in Morpho official UI"
                          data-umami-event="external_link"
                          data-umami-data-target="morpho"
                        >
                          <LinkNewWindow className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">{pctFromWad(p.supplyAprWad)}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">{formatBigintShort(p.suppliedAssets, selectedOption.decimals)}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">{formatBigintShort(p.maxWithdrawAssets, selectedOption.decimals)}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-orange-200 text-right tabular-nums">{formatBigintShort(p.plannedWithdrawAssets, selectedOption.decimals)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
