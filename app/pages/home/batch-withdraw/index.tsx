import { X } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { CollapsibleCardHeader } from '~/components/collapsible-card-header'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
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
    chainOptions,
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
    onChangeChain,
    onChangeLoanAsset,
    onChangeWithdrawAmount,
    hasSomethingToClear,
  } = useBatchWithdrawController()

  return (
    <Card className="mb-6" data-testid="batch-withdraw-card">
      <CollapsibleCardHeader
        title="Batch withdraw"
        subtitle="Withdraws from your lowest-APR markets first."
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(v => !v)}
        actions={hasSomethingToClear && (
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
      />

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
                  chainId={chainId}
                  chainName={chainNameForLinks}
                  chainOptions={chainOptions}
                  loanAssetOptions={loanAssetOptions}
                  selectedLoanAssetAddress={selectedLoanAssetAddress}
                  selectedOption={selectedOption}
                  withdrawAmount={withdrawAmount}
                  symbol={symbol}
                  plan={plan}
                  computedMarketsOk={computedMarkets.ok}
                  onChangeChain={onChangeChain}
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
