import type { LoanAssetOption } from './shared'
import { Minus, Plus } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { InfoTooltip } from '~/components/ui/info-tooltip'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { fmtToken } from '~/lib/optimizer/supply-optimizer-ui-utils'

interface SupplyAprOptimizerFormProps {
  selectedLoanAssetAddress?: string
  onChangeLoanAsset: (addr: string) => void
  ownedLoanAssetOptions: LoanAssetOption[]
  popularLoanAssetOptions: LoanAssetOption[]
  loanAssetOptions: LoanAssetOption[]
  selectedOption?: LoanAssetOption
  totalSuppliedAssets: bigint
  marketApr?: string
  onChangeMarketApr: (value: string) => void
  newDepositAmount?: string
  onChangeNewDepositAmount: (value: string) => void
  onFillMaxDeposit: () => void
  onFillZeroDeposit: () => void
  walletBalanceRaw?: bigint
  symbol: string
  maxMarketsInput: string
  setMaxMarketsInput: (value: string) => void
  parseMaxMarkets: (value: string) => number
  onOptimize: () => void
  optimizeDisabled: boolean
  optimizeLoading: boolean
  optimizeLabel: string
}

export function SupplyAprOptimizerForm({
  selectedLoanAssetAddress,
  onChangeLoanAsset,
  ownedLoanAssetOptions,
  popularLoanAssetOptions,
  loanAssetOptions,
  selectedOption,
  totalSuppliedAssets,
  marketApr,
  onChangeMarketApr,
  newDepositAmount,
  onChangeNewDepositAmount,
  onFillMaxDeposit,
  onFillZeroDeposit,
  walletBalanceRaw,
  symbol,
  maxMarketsInput,
  setMaxMarketsInput,
  parseMaxMarkets,
  onOptimize,
  optimizeDisabled,
  optimizeLoading,
  optimizeLabel,
}: SupplyAprOptimizerFormProps) {
  const unownedPopularOptions = popularLoanAssetOptions
    .filter(o => !ownedLoanAssetOptions.some(x => x.address.toLowerCase() === o.address.toLowerCase()))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 md:gap-4 items-start" data-testid="supply-apr-optimizer-form">
      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center">
          <Label>Asset to optimize</Label>
        </div>
        <Select
          value={selectedLoanAssetAddress ?? undefined}
          onValueChange={onChangeLoanAsset}
        >
          <SelectTrigger className="w-full h-10 bg-gray-900 border-gray-700 text-white text-sm data-[placeholder]:text-gray-500">
            <SelectValue placeholder="Select an asset" />
          </SelectTrigger>
          <SelectContent>
            {ownedLoanAssetOptions.length > 0 && (
              <SelectGroup>
                <SelectLabel>Owned assets</SelectLabel>
                {ownedLoanAssetOptions.map(o => (
                  <SelectItem key={o.address} value={o.address}>
                    {o.symbol}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {unownedPopularOptions.length > 0 && (
              <SelectGroup>
                <SelectLabel>Popular assets</SelectLabel>
                {unownedPopularOptions.map(o => (
                  <SelectItem key={o.address} value={o.address}>
                    {o.symbol}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {ownedLoanAssetOptions.length === 0 && popularLoanAssetOptions.length === 0 && loanAssetOptions.map(o => (
              <SelectItem key={o.address} value={o.address}>
                {o.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-gray-500 min-h-0 md:h-4">
          {selectedOption && (
            <>
              Your supplied:
              {' '}
              {fmtToken(totalSuppliedAssets, selectedOption.decimals)}
              {' '}
              {selectedOption.symbol}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center gap-2">
          <Label>Market APR</Label>
          <InfoTooltip
            ariaLabel="Market APR info"
            content={(
              <span>
                If a market ends below this APR, the optimizer can withdraw funds and leave them in your wallet instead.
              </span>
            )}
          />
        </div>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            value={marketApr ?? ''}
            onChange={e => onChangeMarketApr(e.target.value)}
            placeholder="10"
            className="w-full h-10 pr-16 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 pointer-events-none">
            %
          </span>
        </div>
        <div className="text-xs text-gray-500 min-h-0 md:h-4">Default: 10%</div>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center">
          <Label>Additional amount to supply</Label>
        </div>
        <div className="relative">
          <Input
            type="text"
            inputMode="decimal"
            value={newDepositAmount ?? ''}
            onChange={e => onChangeNewDepositAmount(e.target.value)}
            placeholder="0.0"
            className="w-full h-10 pr-16 border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 focus-visible:ring-blue-500 focus-visible:ring-offset-0"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 pointer-events-none">
            {symbol}
          </span>
        </div>
        <div className="flex items-center gap-2 min-h-0 md:h-4">
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onFillMaxDeposit}>
            Max
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onFillZeroDeposit}>
            Zero
          </Button>
          <div className="text-xs text-gray-500 truncate">
            {selectedOption && (
              <>
                Wallet balance:
                {' '}
                {fmtToken(walletBalanceRaw ?? 0n, selectedOption.decimals)}
                {' '}
                {selectedOption.symbol}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center gap-2">
          <Label>Max markets</Label>
          <InfoTooltip
            ariaLabel="Max markets info"
            content={(
              <span>
                Limits the number of markets used in the optimized allocation.
              </span>
            )}
          />
        </div>
        <div className="grid h-10 w-full grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border border-gray-700 bg-gray-900">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-full rounded-none border-0 border-r border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
            onClick={() => {
              const current = parseMaxMarkets(maxMarketsInput ?? '')
              if (current > 1)
                setMaxMarketsInput(String(current - 1))
            }}
            disabled={parseMaxMarkets(maxMarketsInput ?? '') <= 1}
            aria-label="Decrease max markets"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={maxMarketsInput ?? ''}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D+/g, '')
              setMaxMarketsInput(digitsOnly)
            }}
            className="h-full rounded-none border-0 px-0 text-center tabular-nums text-white placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Max markets"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-full rounded-none border-0 border-l border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
            onClick={() => {
              const current = parseMaxMarkets(maxMarketsInput ?? '')
              setMaxMarketsInput(String(current + 1))
            }}
            aria-label="Increase max markets"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs text-gray-500 leading-4">Use +/- or type a value (min 1)</div>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-0 md:h-5" />
        <Button
          className="w-full h-10"
          onClick={onOptimize}
          disabled={optimizeDisabled}
          isLoading={optimizeLoading}
        >
          {optimizeLabel}
        </Button>
        <div className="h-0 md:h-4" />
      </div>
    </div>
  )
}
