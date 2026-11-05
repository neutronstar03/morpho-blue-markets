import { useEffect, useState } from 'react'
import { formatTimeAgo } from '~/lib/formatters'

export function MarketFreshnessLabel({ dataUpdatedAt }: { dataUpdatedAt: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!dataUpdatedAt)
      return
    const timer = setInterval(() => setTick(value => value + 1), 5000)
    return () => clearInterval(timer)
  }, [dataUpdatedAt])
  const text = dataUpdatedAt ? formatTimeAgo(dataUpdatedAt) : '—'
  return (
    <span className="text-xs text-gray-500 md:text-sm md:text-gray-400 md:tabular-nums md:pr-4 md:w-32 md:text-right">
      {text}
    </span>
  )
}
