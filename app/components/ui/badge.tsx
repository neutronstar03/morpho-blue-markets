import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '~/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: 'success' | 'neutral' | 'subtle' | 'warning' | 'danger'
  size?: 'sm' | 'md'
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        // Size variants
        size === 'sm' && 'px-2 py-0.5 text-[11px]',
        size === 'md' && 'px-2.5 py-1 text-xs',
        // Color variants
        variant === 'success' && 'border-green-700/30 bg-green-900/30 text-green-400',
        variant === 'neutral' && 'border-white/10 bg-white/5 text-gray-300',
        variant === 'subtle' && 'border-transparent bg-transparent text-gray-400',
        variant === 'warning' && 'border-orange-700/30 bg-orange-900/30 text-orange-400',
        variant === 'danger' && 'border-red-700/30 bg-red-900/30 text-red-400',
        className,
      )}
    >
      {children}
    </span>
  )
}

interface BadgeLabelProps {
  children: ReactNode
  className?: string
}

export function BadgeLabel({ children, className }: BadgeLabelProps) {
  return (
    <span className={cn('text-gray-500 font-normal', className)}>
      {children}
    </span>
  )
}
