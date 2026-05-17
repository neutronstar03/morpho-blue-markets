import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { trackEvent } from '~/lib/analytics'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { cn } from '~/lib/utils'
import { SupplyAprOptimizerForm } from '~/pages/home/supply-apr-optimizer/optimizer-form'
import { SupplyAprOptimizerResults } from '~/pages/home/supply-apr-optimizer/optimizer-results'
import { useSupplyAprOptimizerController } from '~/pages/home/supply-apr-optimizer/use-supply-apr-optimizer-controller'

export function SupplyAprOptimizer() {
  const [isExpanded, setIsExpanded] = useLocalStorage('supply-apr-optimizer:expanded', false)

  const {
    ctx,
    userAddress,
    isViewingWallet,
    chain,
    isLoadingPositions,
    ownedLoanAssetOptions,
    popularLoanAssetOptions,
    loanAssetOptions,
    selectedOption,
    symbol,
    walletBalanceRaw,
    maxMarketsInput,
    setMaxMarketsInput,
    strategyInput,
    onChangeStrategy,
    onChangeLoanAsset,
    onChangeMarketApr,
    onFillMaxDeposit,
    onFillZeroDeposit,
    onOptimize,
    onCancelOptimize,
    canOptimize,
    optimizeLabel,
    topMarketsQuery,
    displayResult,
    marketMetaById,
    chainIdForLinks,
    chainNameForLinks,
    autoStepInfo,
    totalAllocatedAssets,
    morphoAddress,
    userSupplySharesByMarketId,
    hasSomethingToClear,
    parseMaxMarkets,
    getDefaultMarketAprByAssetSymbol,
  } = useSupplyAprOptimizerController()

  return (
    <Card className="mb-6" data-testid="supply-apr-optimizer-card">
      <div className={cn('p-4 border-b border-gray-700 flex items-center justify-between gap-3', !isExpanded && 'min-h-20')}>
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">Supply APR optimizer</h2>
          <p className={cn('text-sm text-gray-400', !isExpanded && 'hidden')}>
            Suggests how to rebalance your existing supply to improve APR.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasSomethingToClear && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={ctx.run.isRunning
                ? onCancelOptimize
                : () => {
                    trackEvent('optimizer_results_cleared', { loanAsset: selectedOption?.symbol, chainId: chain?.id })
                    ctx.clear()
                  }}
              className={cn(
                'h-8 px-2.5 text-xs',
                ctx.run.isRunning && 'border-red-500/60 text-red-200 hover:bg-red-500/10 hover:text-red-100',
              )}
              title={ctx.run.isRunning ? 'Cancel' : 'Clear'}
            >
              <X className="h-3.5 w-3.5" />
              {ctx.run.isRunning ? 'Cancel' : 'Clear'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(v => !v)}
            className="h-8 w-8 px-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse supply APR optimizer' : 'Expand supply APR optimizer'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="p-4 sm:p-6 space-y-6">
            {!userAddress && (
              <div className="text-sm text-gray-300">Connect your wallet to compute an optimized supply plan.</div>
            )}

            {userAddress && (
              <>
                {!isLoadingPositions && ownedLoanAssetOptions.length === 0 && (
                  <div className="text-sm text-gray-300 border border-gray-700 bg-gray-900/40 rounded-md p-3">
                    No current supply positions detected. You can still pick a supported asset and simulate a new deposit.
                  </div>
                )}

                <SupplyAprOptimizerForm
                  selectedLoanAssetAddress={ctx.selection.loanAssetAddress}
                  onChangeLoanAsset={onChangeLoanAsset}
                  ownedLoanAssetOptions={ownedLoanAssetOptions}
                  popularLoanAssetOptions={popularLoanAssetOptions}
                  loanAssetOptions={loanAssetOptions}
                  selectedOption={selectedOption}
                  totalSuppliedAssets={ctx.derived.totalSuppliedAssets ?? 0n}
                  marketApr={ctx.inputs.marketApr}
                  defaultMarketApr={getDefaultMarketAprByAssetSymbol(selectedOption?.symbol ?? ctx.selection.loanAssetSymbol)}
                  onChangeMarketApr={onChangeMarketApr}
                  newDepositAmount={ctx.inputs.newDepositAmount}
                  onChangeNewDepositAmount={value => ctx.setNewDepositAmount(value)}
                  onFillMaxDeposit={onFillMaxDeposit}
                  onFillZeroDeposit={onFillZeroDeposit}
                  walletBalanceRaw={walletBalanceRaw}
                  symbol={symbol}
                  maxMarketsInput={maxMarketsInput ?? ''}
                  setMaxMarketsInput={setMaxMarketsInput}
                  parseMaxMarkets={parseMaxMarkets}
                  strategy={strategyInput}
                  onChangeStrategy={onChangeStrategy}
                  onOptimize={onOptimize}
                  optimizeDisabled={ctx.run.isRunning || !canOptimize || topMarketsQuery.isLoading || topMarketsQuery.isFetching}
                  optimizeLoading={ctx.run.isRunning || topMarketsQuery.isLoading || topMarketsQuery.isFetching}
                  optimizeLabel={optimizeLabel}
                />

                {ctx.run.error && (
                  <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                    {ctx.run.error}
                  </div>
                )}

                {displayResult && selectedOption && (
                  <SupplyAprOptimizerResults
                    displayResult={displayResult}
                    selectedOption={selectedOption}
                    symbol={symbol}
                    marketMetaById={marketMetaById}
                    chainIdForLinks={chainIdForLinks}
                    chainNameForLinks={chainNameForLinks}
                    autoStepInfo={autoStepInfo}
                    totalAllocatedAssets={totalAllocatedAssets}
                    userAddress={userAddress as `0x${string}` | undefined}
                    chainId={chainIdForLinks}
                    morphoAddress={morphoAddress as `0x${string}` | undefined}
                    userSupplySharesByMarketId={userSupplySharesByMarketId}
                    readOnly={isViewingWallet}
                    onExecutedSuccess={() => ctx.clear()}
                  />
                )}
              </>
            )}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </Card>
  )
}
