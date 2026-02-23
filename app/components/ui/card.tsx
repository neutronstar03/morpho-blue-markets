import type { HTMLAttributes, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={twMerge(
        'bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}
