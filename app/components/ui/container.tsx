import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface ContainerProps {
  children: ReactNode
  className?: string
}

export function Container({ children, className }: ContainerProps) {
  return (
    <div className={twMerge('w-full mx-auto px-2 sm:px-4 lg:px-8 xl:max-w-[1600px]', className)}>
      {children}
    </div>
  )
}
