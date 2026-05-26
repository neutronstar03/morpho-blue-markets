import type { ReactNode } from 'react'

interface DetailPillGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4
  className?: string
}

export function DetailPillGrid({ children, columns = 2, className }: DetailPillGridProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[columns]

  return (
    <div className={`grid ${gridCols} gap-2 ${className ?? ''}`}>
      {children}
    </div>
  )
}
