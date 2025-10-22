import type { ReactNode } from 'react'

interface MainProps {
  children: ReactNode
}

export function Main({ children }: MainProps) {
  return (
    <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 xl:max-w-[1600px]">
      {children}
    </main>
  )
}
