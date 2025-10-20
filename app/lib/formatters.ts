import { formatUnits } from 'viem'

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

export function formatAmount(amount: bigint, decimals: number) {
  const formatted = formatUnits(amount, decimals)
  const [integer, fraction] = formatted.split('.')

  const formattedInteger = BigInt(integer).toLocaleString('de-DE')

  if (fraction) {
    const significantFraction = fraction.slice(0, 2)
    if (Number(significantFraction) === 0) {
      return formattedInteger
    }
    const paddedFraction = significantFraction.padEnd(2, '0')
    return `${formattedInteger},${paddedFraction}`
  }

  return formattedInteger
}

export function formatNumber(amount: number, decimals: number): string {
  if (Number.isNaN(amount) || typeof amount === 'undefined') {
    return (0).toFixed(decimals)
  }

  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatAmountSpecific(amount: bigint, decimals: number) {
  const formatted = formatUnits(amount, decimals)
  return formatted
}

export function formatLltv(value: string) {
  const numericValue = Number(formatUnits(BigInt(value), 18))
  return formatPercent(numericValue)
}

export function formatUsd(value: number): string {
  if (Number.isNaN(value) || typeof value === 'undefined')
    return '$0.00'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export function formatPercent(value: number): string {
  if (Number.isNaN(value) || typeof value === 'undefined')
    return '0.00%'

  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}
