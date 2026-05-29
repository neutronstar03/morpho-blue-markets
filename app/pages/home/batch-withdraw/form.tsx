import type { BatchWithdrawChainOption, BatchWithdrawPlanState, LoanAssetOption } from './shared'
import { Maximize2 } from 'lucide-react'
import { formatUnits } from 'viem'
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
import { CHAIN_ICON_BY_ID } from '~/lib/chain-icons'
import { formatBigintShort } from '~/lib/formatters'
import { trimTrailingZerosDecimalString } from '~/lib/optimizer/supply-optimizer-ui-utils'

interface BatchWithdrawFormProps {
  isLoadingPositions: boolean
  chainId?: number
  chainName?: string
  chainOptions: BatchWithdrawChainOption[]
  loanAssetOptions: LoanAssetOption[]
  selectedLoanAssetAddress: string
  selectedOption?: LoanAssetOption
  withdrawAmount: string
  symbol: string
  plan: BatchWithdrawPlanState
  computedMarketsOk: boolean
  onChangeChain: (chainId: number) => void
  onChangeLoanAsset: (address: string) => void
  onChangeWithdrawAmount: (value: string) => void
}

export function BatchWithdrawForm({
  isLoadingPositions,
  chainId,
  chainName,
  chainOptions,
  loanAssetOptions,
  selectedLoanAssetAddress,
  selectedOption,
  withdrawAmount,
  symbol,
  plan,
  computedMarketsOk,
  onChangeChain,
  onChangeLoanAsset,
  onChangeWithdrawAmount,
}: BatchWithdrawFormProps) {
  const ChainIcon = chainId ? CHAIN_ICON_BY_ID[chainId] : undefined

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 md:gap-4 items-start" data-testid="batch-withdraw-form">
        <div className="flex flex-col gap-1.5 md:gap-2 md:col-span-2">
          <div className="h-5 flex items-center">
            <Label className="text-gray-200">Asset</Label>
          </div>
          <div className="flex gap-2">
            <Select value={chainId != null ? String(chainId) : ''} onValueChange={value => onChangeChain(Number(value))}>
              <SelectTrigger
                className="h-10 w-14 shrink-0 border-gray-700 bg-gray-900 px-2 text-white"
                title={chainName ? `Withdraw network: ${chainName}` : 'Withdraw network'}
                aria-label={chainName ? `Withdraw network ${chainName}` : 'Withdraw network'}
              >
                {ChainIcon
                  ? <ChainIcon size={18} variant="branded" className="h-[18px] w-[18px]" />
                  : <span className="text-xs font-semibold">{chainName?.slice(0, 1) ?? '?'}</span>}
              </SelectTrigger>
              <SelectContent
                align="start"
                position="popper"
                className="z-[80] border-gray-700 bg-gray-950 text-white"
              >
                <SelectGroup>
                  <SelectLabel>Network</SelectLabel>
                  {chainOptions.map((option) => {
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
              value={selectedLoanAssetAddress || undefined}
              onValueChange={onChangeLoanAsset}
              disabled={isLoadingPositions || loanAssetOptions.length === 0}
            >
              <SelectTrigger className="h-10 min-w-0 flex-1 border-gray-700 bg-gray-900 text-sm text-white">
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
          </div>
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
