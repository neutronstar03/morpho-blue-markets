import type { AutoStepInfo, LoanAssetOption, OptimizerMarketMeta } from './shared'
import type { OptimizeSupplyWithPositionsResult } from '~/lib/optimizer/supply-optimizer'
import { createSearchParams, Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import LinkNewWindow from '~/assets/link-new-window.svg?react'
import { MarketRiskText } from '~/components/ui/market-risk-text'
import { formatBigintShort } from '~/lib/formatters'
import { morphoAppMarketUrl } from '~/lib/morpho/morpho-app'
import { fmtToken, pctFromWad, trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'
import { BundleOptimizerResult } from '~/pages/home/bundle-optimizer-result'

interface SupplyAprOptimizerResultsProps {
  displayResult: OptimizeSupplyWithPositionsResult
  selectedOption: LoanAssetOption
  symbol: string
  marketMetaById: Map<string, OptimizerMarketMeta>
  chainIdForLinks?: number
  chainNameForLinks?: string
  autoStepInfo: AutoStepInfo | null
  totalAllocatedAssets: bigint
  userAddress?: `0x${string}`
  chainId?: number
  morphoAddress?: `0x${string}`
  userSupplySharesByMarketId: Map<string, bigint>
  onExecutedSuccess?: () => void
}

const WAD = 10n ** 18n

export function SupplyAprOptimizerResults({
  displayResult,
  selectedOption,
  symbol,
  marketMetaById,
  chainIdForLinks,
  chainNameForLinks,
  autoStepInfo,
  totalAllocatedAssets,
  userAddress,
  chainId,
  morphoAddress,
  userSupplySharesByMarketId,
  onExecutedSuccess,
}: SupplyAprOptimizerResultsProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
          <div className="text-xs text-gray-400">Current blended APR</div>
          <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.current.blendedAprWad)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
          <div className="text-xs text-gray-400">Optimized blended APR</div>
          <div className="text-lg font-semibold text-white tabular-nums">{pctFromWad(displayResult.optimized.blendedAprWad)}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
          <div className="text-xs text-gray-400">Iterations</div>
          <div className="text-lg font-semibold text-white tabular-nums">{displayResult.iterations}</div>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-700 rounded-md">
        <table className="min-w-full divide-y divide-gray-700" data-testid="supply-apr-optimizer-result-table">
          <thead className="bg-gray-800/40">
            <tr>
              <th className="px-3 sm:px-4 py-2 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Market</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Current</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Target</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Delta</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">APR after</th>
              <th className="px-3 sm:px-4 py-2 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Yearly return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700 bg-gray-900/20">
            {displayResult.positions.map((p) => {
              const deltaSign = p.deltaAssets >= 0n ? '+' : ''
              const isWallet = p.destinationKind === 'wallet'
              const meta = isWallet ? undefined : marketMetaById.get(p.marketId.toLowerCase())
              const riskStatus = meta?.status
              const marketLabel = isWallet
                ? (p.label ?? 'Withdraw to wallet')
                : (meta?.collateralSymbol ? `${meta.collateralSymbol} / ${symbol}` : `${p.marketId.slice(0, 10)}…${p.marketId.slice(-6)}`)
              const absDeltaAssets = p.deltaAssets < 0n ? -p.deltaAssets : p.deltaAssets
              const deepLinkTab = p.deltaAssets < 0n ? 'withdraw' : 'deposit'
              const deepLinkAmount = trimTrailingZerosDecimalString(formatUnits(absDeltaAssets, selectedOption.decimals))
              const deepLinkSearch = !isWallet && absDeltaAssets > 0n && deepLinkAmount
                ? createSearchParams({
                    tab: deepLinkTab,
                    unit: 'asset',
                    amount: deepLinkAmount,
                  }).toString()
                : ''
              const yearlyReturnAssets = (p.amountAssets * p.supplyAprAfterWad) / WAD

              return (
                <tr key={p.marketId}>
                  <td className="px-3 sm:px-4 py-2 text-sm text-white">
                    <div className="flex items-center gap-2">
                      {!isWallet && chainIdForLinks
                        ? (
                            <Link
                              to={{
                                pathname: `/market/${p.marketId}/${chainIdForLinks}`,
                                search: deepLinkSearch ? `?${deepLinkSearch}` : '',
                              }}
                              className="hover:opacity-90 transition-opacity"
                              data-umami-event="market_navigate"
                              data-umami-data-source="optimizer"
                            >
                              <MarketRiskText status={riskStatus}>{marketLabel}</MarketRiskText>
                            </Link>
                          )
                        : (
                            <span className="text-gray-200">{marketLabel}</span>
                          )}
                      {!isWallet && chainNameForLinks && (
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
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                    {fmtToken(p.currentUserAssets, selectedOption.decimals)}
                    {' '}
                    {symbol}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">
                    {fmtToken(p.amountAssets, selectedOption.decimals)}
                    {' '}
                    {symbol}
                  </td>
                  <td className={`px-3 sm:px-4 py-2 text-sm text-right tabular-nums ${p.deltaAssets >= 0n ? 'text-green-300' : 'text-orange-300'}`}>
                    {deltaSign}
                    {fmtToken(p.deltaAssets, selectedOption.decimals)}
                    {' '}
                    {symbol}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">{pctFromWad(p.supplyAprAfterWad)}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm text-gray-200 text-right tabular-nums">{fmtToken(yearlyReturnAssets, selectedOption.decimals)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="pt-2">
        <div className="flex flex-row items-center mx-4 gap-2">
          {autoStepInfo && (
            <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
              <span>Auto step</span>
              <span className="text-sm text-white whitespace-nowrap">
                {formatBigintShort(autoStepInfo.stepAssets, selectedOption.decimals)}
                {' '}
                {symbol}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                (
                {pctFromWad(autoStepInfo.stepRatioWad)}
                )
              </span>
              {autoStepInfo.attempts > 0 && (
                <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap">
                  Auto step found in
                  {' '}
                  {autoStepInfo.attempts}
                  {' '}
                  tries
                </span>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <p className="text-xs text-gray-400 whitespace-nowrap">Total optimized</p>
            <p className="text-sm text-white whitespace-nowrap">
              {formatBigintShort(totalAllocatedAssets, selectedOption.decimals)}
              {' '}
              {symbol}
            </p>
          </div>
        </div>
        {displayResult.unallocatedNewDepositAssets > 0n && (
          <div className="flex flex-row justify-center items-center mx-4 mt-1 sm:justify-end gap-1 sm:gap-2">
            <p className="text-xs text-gray-400 whitespace-nowrap">Unallocated deposit</p>
            <p className="text-sm text-white whitespace-nowrap">
              {formatBigintShort(displayResult.unallocatedNewDepositAssets, selectedOption.decimals)}
              {' '}
              {symbol}
            </p>
          </div>
        )}
      </div>

      {userAddress && chainId && morphoAddress && (
        <BundleOptimizerResult
          displayResult={displayResult}
          chainId={chainId}
          morphoAddress={morphoAddress}
          marketMetaById={marketMetaById}
          userAddress={userAddress}
          userSupplySharesByMarketId={userSupplySharesByMarketId}
          loanToken={{
            address: selectedOption.address as `0x${string}`,
            symbol,
            decimals: selectedOption.decimals,
          }}
          onExecutedSuccess={onExecutedSuccess}
        />
      )}
    </div>
  )
}
