import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface StatPillProps {
  label: ReactNode
  value: ReactNode
  className?: string
}

// Small label/value "tiny card" used for quick market stats.
export function StatPill({ label, value, className }: StatPillProps) {
  return (
    <div
      className={twMerge(
        'inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs flex-col sm:flex-row',
        className,
      )}
    >
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-200">{value}</span>
    </div>
  )
}
