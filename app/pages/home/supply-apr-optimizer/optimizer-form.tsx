import type { LoanAssetOption, OptimizerChainOption } from './shared'
import type { OptimizerStrategy } from '~/lib/optimizer/supply-optimizer-runner'
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
import { StepperInput } from '~/components/ui/stepper-input'
import { CHAIN_ICON_BY_ID } from '~/lib/chain-icons'
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
  defaultMarketApr: string
  onChangeMarketApr: (value: string) => void
  newDepositAmount?: string
  onChangeNewDepositAmount: (value: string) => void
  onFillMaxDeposit: () => void
  onFillZeroDeposit: () => void
  walletBalanceRaw?: bigint
  optimizerChainId?: number
  optimizerChainName?: string
  optimizerChainOptions: OptimizerChainOption[]
  onChangeOptimizerChain: (chainId: number) => void
  symbol: string
  maxMarketsInput: string
  setMaxMarketsInput: (value: string) => void
  parseMaxMarkets: (value: string) => number
  strategy: OptimizerStrategy
  onChangeStrategy: (value: OptimizerStrategy) => void
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
  defaultMarketApr,
  onChangeMarketApr,
  newDepositAmount,
  onChangeNewDepositAmount,
  onFillMaxDeposit,
  onFillZeroDeposit,
  walletBalanceRaw,
  optimizerChainId,
  optimizerChainName,
  optimizerChainOptions,
  onChangeOptimizerChain,
  symbol,
  maxMarketsInput,
  setMaxMarketsInput,
  parseMaxMarkets,
  strategy,
  onChangeStrategy,
  onOptimize,
  optimizeDisabled,
  optimizeLoading,
  optimizeLabel,
}: SupplyAprOptimizerFormProps) {
  const unownedPopularOptions = popularLoanAssetOptions
    .filter(o => !ownedLoanAssetOptions.some(x => x.address.toLowerCase() === o.address.toLowerCase()))
  const OptimizerChainIcon = optimizerChainId ? CHAIN_ICON_BY_ID[optimizerChainId] : undefined

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 md:gap-4 items-start" data-testid="supply-apr-optimizer-form">
      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center">
          <Label>Asset to optimize</Label>
        </div>
        <div className="flex gap-2">
          <Select value={optimizerChainId != null ? String(optimizerChainId) : ''} onValueChange={value => onChangeOptimizerChain(Number(value))}>
            <SelectTrigger
              className="h-10 w-14 shrink-0 border-gray-700 bg-gray-900 px-2 text-white"
              title={optimizerChainName ? `Optimizer network: ${optimizerChainName}` : 'Optimizer network'}
              aria-label={optimizerChainName ? `Optimizer network ${optimizerChainName}` : 'Optimizer network'}
            >
              {OptimizerChainIcon
                ? <OptimizerChainIcon size={18} variant="branded" className="h-[18px] w-[18px]" />
                : <span className="text-xs font-semibold">{optimizerChainName?.slice(0, 1) ?? '?'}</span>}
            </SelectTrigger>
            <SelectContent
              align="start"
              position="popper"
              className="z-[80] border-gray-700 bg-gray-950 text-white"
            >
              <SelectGroup>
                <SelectLabel>Network</SelectLabel>
                {optimizerChainOptions.map((option) => {
                  const Icon = CHAIN_ICON_BY_ID[option.chainId]
                  return (
                    <SelectItem key={option.chainId} value={String(option.chainId)}>
                      {Icon
                        ? <Icon size={16} variant="branded" className="h-4 w-4" />
                        : <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-[10px] text-white">{option.name.slice(0, 1)}</span>}
                      <span>{option.name}</span>
                    </SelectItem>
                  )
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={selectedOption?.address ?? selectedLoanAssetAddress ?? ''}
            onValueChange={onChangeLoanAsset}
          >
            <SelectTrigger className="h-10 min-w-0 flex-1 bg-gray-900 border-gray-700 text-white text-sm data-[placeholder]:text-gray-500">
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
        </div>
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
                {strategy === 'maxDeploy'
                  ? 'The base rate for your asset. The optimizer will hold positions earning above this APR and only withdraw from markets below it.'
                  : 'If a market ends below this APR, the optimizer can withdraw funds and leave them in your wallet instead.'}
              </span>
            )}
          />
        </div>
        <StepperInput
          value={marketApr ?? ''}
          onChange={onChangeMarketApr}
          onDecrement={() => {
            const current = Number.parseFloat(marketApr ?? '0')
            if (!Number.isFinite(current) || current <= 0.25)
              return
            const next = Math.max(0, Math.round((current - 0.25) * 100) / 100)
            onChangeMarketApr(String(next))
          }}
          onIncrement={() => {
            const current = Number.parseFloat(marketApr ?? '0')
            const next = Math.round(((Number.isFinite(current) ? current : 0) + 0.25) * 100) / 100
            onChangeMarketApr(String(next))
          }}
          canDecrement={Number.parseFloat(marketApr ?? '0') > 0.25}
          placeholder={defaultMarketApr}
          ariaLabel="Market APR percent"
          inputClassName="px-2"
        />
        <div className="text-xs text-gray-500 min-h-0 md:h-4">
          Default:
          {' '}
          {defaultMarketApr}
          %
        </div>
      </div>

      <div className="flex flex-col gap-1.5 md:gap-2">
        <div className="h-5 flex items-center gap-2">
          <Label>Strategy</Label>
          <InfoTooltip
            ariaLabel="Strategy info"
            content={(
              <span>
                {strategy === 'maxYield'
                  ? 'Max Yield: maximize total portfolio APR, even if it means withdrawing from profitable positions to chase higher yield.'
                  : 'Max Deploy: hold positions earning above the Market APR and only withdraw from markets below it. Maximizes capital deployed above base rate.'}
              </span>
            )}
          />
        </div>
        <div className="grid grid-cols-2 h-10 overflow-hidden rounded-md border border-gray-700 bg-gray-900">
          <button
            type="button"
            onClick={() => onChangeStrategy('maxYield')}
            className={`text-sm font-medium transition-colors cursor-pointer ${strategy === 'maxYield' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            Max Yield
          </button>
          <button
            type="button"
            onClick={() => onChangeStrategy('maxDeploy')}
            className={`text-sm font-medium transition-colors cursor-pointer ${strategy === 'maxDeploy' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            Max Deploy
          </button>
        </div>
        <div className="text-xs text-gray-500 min-h-0 md:h-4">
          {strategy === 'maxYield' ? 'Chase highest APR' : 'Hold above base rate'}
        </div>
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
        <StepperInput
          value={maxMarketsInput ?? ''}
          onChange={(value) => {
            const digitsOnly = value.replace(/\D+/g, '')
            setMaxMarketsInput(digitsOnly)
          }}
          onDecrement={() => {
            const current = parseMaxMarkets(maxMarketsInput ?? '')
            if (current > 1)
              setMaxMarketsInput(String(current - 1))
          }}
          onIncrement={() => {
            const current = parseMaxMarkets(maxMarketsInput ?? '')
            setMaxMarketsInput(String(current + 1))
          }}
          canDecrement={parseMaxMarkets(maxMarketsInput ?? '') > 1}
          inputMode="numeric"
          pattern="[0-9]*"
          ariaLabel="Max markets"
          inputClassName="px-0"
        />
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
