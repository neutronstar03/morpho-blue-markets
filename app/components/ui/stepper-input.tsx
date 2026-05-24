import { Minus, Plus } from 'lucide-react'
import * as React from 'react'
import { cn } from '~/lib/utils'
import { Button } from './button'
import { Input } from './input'

export interface StepperInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
  onDecrement: () => void
  onIncrement: () => void
  canDecrement?: boolean
  canIncrement?: boolean
  ariaLabel?: string
  suffix?: React.ReactNode
  inputClassName?: string
}

export const StepperInput = React.forwardRef<HTMLInputElement, StepperInputProps>(
  (
    {
      value,
      onChange,
      onDecrement,
      onIncrement,
      canDecrement = true,
      canIncrement = true,
      ariaLabel,
      suffix,
      className,
      inputClassName,
      inputMode = 'decimal',
      ...props
    },
    ref,
  ) => {
    return (
      <div
        className={cn(
          'grid h-10 w-full grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border border-gray-700 bg-gray-900',
          className,
        )}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-full rounded-none border-0 border-r border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
          onClick={onDecrement}
          disabled={!canDecrement}
          aria-label={`Decrease ${ariaLabel ?? 'value'}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="relative">
          <Input
            ref={ref}
            type="text"
            inputMode={inputMode}
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={ariaLabel}
            className={cn(
              'h-full rounded-none border-0 bg-gray-900 text-center tabular-nums text-white placeholder:text-gray-500',
              'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset focus-visible:ring-offset-0',
              '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
              inputClassName,
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-full rounded-none border-0 border-l border-gray-700 bg-gray-900 px-0 text-gray-300 hover:bg-gray-800 hover:text-white"
          onClick={onIncrement}
          disabled={!canIncrement}
          aria-label={`Increase ${ariaLabel ?? 'value'}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    )
  },
)

StepperInput.displayName = 'StepperInput'
