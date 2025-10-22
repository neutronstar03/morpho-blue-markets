import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface ContainerProps {
  children: ReactNode
  className?: string
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div className={twMerge('w-full mx-auto px-4 sm:px-6 lg:px-8 xl:max-w-[1600px]', className)}>
      {children}
    </div>
  )
}
