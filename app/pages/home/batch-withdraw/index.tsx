import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { cn } from '~/lib/utils'
import { BatchWithdrawExecutionPanel } from './execution-panel'
import { BatchWithdrawForm } from './form'
import { BatchWithdrawResults } from './results'
import { useBatchWithdrawController } from './use-batch-withdraw-controller'

export function BatchWithdraw() {
  const [isExpanded, setIsExpanded] = useLocalStorage('batch-withdraw:expanded', false)

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
    <Card className="mb-6" data-testid="batch-withdraw-card">
      <div className={cn('p-4 border-b border-gray-700 flex items-center justify-between gap-3', !isExpanded && 'min-h-20')}>
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-white">Batch withdraw</h2>
          <p className={cn('text-sm text-gray-400', !isExpanded && 'hidden')}>
            Withdraws from your lowest-APR markets first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasSomethingToClear && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clear}
              className="h-8 px-2.5 text-xs"
              title="Clear"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(v => !v)}
            className="h-8 w-8 px-0"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse batch withdraw' : 'Expand batch withdraw'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
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
        </Collapsible.Content>
      </Collapsible.Root>
    </Card>
  )
}
