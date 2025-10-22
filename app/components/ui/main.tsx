import type { ReactNode } from 'react'
import { Container } from './container'

interface MainProps {
  children: ReactNode
}

export function Main({ children }: MainProps) {
  return (
    <main className="py-8">
      <Container>
        {children}
      </Container>
    </main>
  )
}
