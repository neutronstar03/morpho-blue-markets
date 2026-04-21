import { X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { BatchWithdrawExecutionPanel } from './execution-panel'
import { BatchWithdrawForm } from './form'
import { BatchWithdrawResults } from './results'
import { useBatchWithdrawController } from './use-batch-withdraw-controller'

export function BatchWithdraw() {
  const {
    userAddress,
    chainId,
    chainNameForLinks,
    isLoadingPositions,
    loanAssetOptions,
    selectedLoanAssetAddress,
    selectedOption,
    withdrawAmount,
    symbol,
    computedMarkets,
    plan,
    hasPlan,
    plannedTotal,
    execution,
    clear,
    onChangeLoanAsset,
    onChangeWithdrawAmount,
    hasSomethingToClear,
  } = useBatchWithdrawController()

  return (
    <Card className="mb-8" data-testid="batch-withdraw-card">
      <div className="p-4 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">
            Batch withdraw
            <span className="text-xs text-gray-400"> (beta)</span>
          </h2>
          <p className="text-sm text-gray-400">Withdraws from your lowest-APR markets first.</p>
        </div>

        {hasSomethingToClear && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clear}
            className="ml-auto h-8 px-2.5 text-xs"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        {!userAddress && (
          <div className="text-sm text-gray-300">Connect your wallet to plan a batch withdraw.</div>
        )}

        {userAddress && (
          <>
            <BatchWithdrawForm
              isLoadingPositions={isLoadingPositions}
              loanAssetOptions={loanAssetOptions}
              selectedLoanAssetAddress={selectedLoanAssetAddress}
              selectedOption={selectedOption}
              withdrawAmount={withdrawAmount}
              symbol={symbol}
              plan={plan}
              computedMarketsOk={computedMarkets.ok}
              onChangeLoanAsset={onChangeLoanAsset}
              onChangeWithdrawAmount={onChangeWithdrawAmount}
            />

            {plan.error && (
              <div className="text-sm text-red-300 border border-red-900/40 bg-red-950/20 rounded-md p-3">
                {plan.error}
              </div>
            )}

            {hasPlan && selectedOption && (
              <>
                <BatchWithdrawResults
                  plan={plan}
                  selectedOption={selectedOption}
                  symbol={symbol}
                  plannedTotal={plannedTotal}
                  chainId={chainId}
                  chainNameForLinks={chainNameForLinks}
                />
                <BatchWithdrawExecutionPanel execution={execution} />
              </>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
