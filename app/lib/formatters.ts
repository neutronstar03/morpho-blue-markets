export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const seconds = Math.floor((now - timestamp) / 1000)

  if (seconds < 5) {
    return 'just now'
  }
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  return `${Math.floor(seconds / 60)}m${seconds % 60 > 0 ? ` ${seconds % 60}s` : ''} ago`
}

export function formatMarketSize(supplyAssetsUsd: number | undefined): string {
  const value = supplyAssetsUsd ?? 0

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}m`
  }
  else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`
  }

  return `$${value.toFixed(1)}`
}
