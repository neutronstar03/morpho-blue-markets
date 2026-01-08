import * as Popover from '@radix-ui/react-popover'
import { Info } from 'lucide-react'
import * as React from 'react'

import { cn } from '~/lib/utils'

export interface InfoTooltipProps {
  content: React.ReactNode
  className?: string
  iconClassName?: string
  side?: React.ComponentProps<typeof Popover.Content>['side']
  align?: React.ComponentProps<typeof Popover.Content>['align']
  ariaLabel?: string
}

/**
 * Tap-friendly "tooltip" for desktop + mobile.
 *
 * Important: the trigger is a dedicated icon button, so it doesn't steal clicks from the surrounding UI.
 */
export function InfoTooltip({
  content,
  className,
  iconClassName,
  side = 'top',
  align = 'center',
  ariaLabel = 'Info',
}: InfoTooltipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-full cursor-pointer',
            'text-gray-400 hover:text-gray-200 hover:bg-white/10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0',
          )}
        >
          <Info className={cn('h-4 w-4', iconClassName)} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          className={cn(
            'z-50 max-w-[18rem] rounded-md border border-white/10 bg-gray-900 px-3 py-2 text-xs text-gray-200 shadow-lg',
            className,
          )}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
