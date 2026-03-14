import type { BatchWithdrawPlanState, LoanAssetOption } from './shared'
import { Maximize2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { Button } from '~/components/ui/button'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { formatBigintShort } from '~/lib/formatters'
import { trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'

interface BatchWithdrawFormProps {
  isLoadingPositions: boolean
  loanAssetOptions: LoanAssetOption[]
  selectedLoanAssetAddress: string
  selectedOption?: LoanAssetOption
  withdrawAmount: string
  symbol: string
  plan: BatchWithdrawPlanState
  computedMarketsOk: boolean
  onChangeLoanAsset: (address: string) => void
  onChangeWithdrawAmount: (value: string) => void
}

export function BatchWithdrawForm({
  isLoadingPositions,
  loanAssetOptions,
  selectedLoanAssetAddress,
  selectedOption,
  withdrawAmount,
  symbol,
  plan,
  computedMarketsOk,
  onChangeLoanAsset,
  onChangeWithdrawAmount,
}: BatchWithdrawFormProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-4 items-start" data-testid="batch-withdraw-form">
        <div className="flex flex-col gap-1.5 md:gap-2 md:col-span-2">
          <div className="h-5 flex items-center">
            <Label className="text-gray-200">Asset</Label>
          </div>
          <Select
            value={selectedLoanAssetAddress || undefined}
            onValueChange={onChangeLoanAsset}
            disabled={isLoadingPositions || loanAssetOptions.length === 0}
          >
            <SelectTrigger className="w-full h-10 bg-gray-900 border-gray-700 text-white text-sm">
              <SelectValue placeholder={isLoadingPositions ? 'Loading…' : 'Select an asset'} />
            </SelectTrigger>
            <SelectContent>
              {loanAssetOptions.map(o => (
                <SelectItem key={o.address} value={o.address}>
                  {o.symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="h-0 md:h-4" />
        </div>

        <div className="flex flex-col gap-1.5 md:gap-2 md:col-span-2">
          <div className="h-5 flex items-center">
            <Label className="text-gray-200" htmlFor="batch-withdraw-amount">Amount</Label>
          </div>
          <div className="relative">
            <Input
              id="batch-withdraw-amount"
              type="text"
              inputMode="decimal"
              value={withdrawAmount}
              onChange={e => onChangeWithdrawAmount(e.target.value)}
              placeholder="0.0"
              className="w-full h-10 pr-20 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              disabled={!selectedOption}
            />
            <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400">
              {symbol}
            </span>
          </div>
          <div className="h-0 md:h-4" />
        </div>

        <div className="flex flex-col gap-1.5 md:gap-2">
          <div className="h-5 flex items-center gap-2">
            <Label className="text-gray-200">Quick action</Label>
            <InfoTooltip
              ariaLabel="Max amount info"
              content={(
                <span>
                  Sets the amount to your maximum withdrawable balance across all markets for this asset (accounting for liquidity constraints).
                </span>
              )}
            />
          </div>
          <Button
            className="w-full h-10"
            onClick={() => {
              if (!selectedOption)
                return
              const s = trimTrailingZerosDecimalString(formatUnits(plan.totalWithdrawable, selectedOption.decimals))
              if (s)
                onChangeWithdrawAmount(s)
            }}
            disabled={!selectedOption || !computedMarketsOk}
          >
            <Maximize2 className="w-4 h-4 mr-1" />
            Max
          </Button>
          <div className="h-0 md:h-4" />
        </div>
      </div>

      {selectedOption && (
        <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Supplied:
            {' '}
            <span className="text-gray-300">
              {formatBigintShort(plan.totalSupplied, selectedOption.decimals)}
              {' '}
              {symbol}
            </span>
          </span>
          <span>
            Max withdrawable:
            {' '}
            <span className="text-gray-300">
              {formatBigintShort(plan.totalWithdrawable, selectedOption.decimals)}
              {' '}
              {symbol}
            </span>
          </span>
        </div>
      )}
    </>
  )
}
