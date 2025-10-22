import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={twMerge(
        'bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}
