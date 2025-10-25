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

// Formats token amounts for UI with readable precision and compact notation for large values.
// - Large (>= 1,000,000): compact (e.g. 1.23M)
// - 1,000 to < 1,000,000: up to 2 fraction digits
// - 1 to < 1,000: up to 4 fraction digits
// - < 1: up to 6 fraction digits (with a floor display for very small non-zero values)
export function formatTokenAmountShort(amount: number): string {
  if (!Number.isFinite(amount) || typeof amount === 'undefined' || amount === 0)
    return '0'

  const abs = Math.abs(amount)

  // Extremely small but non-zero values
  if (abs < 0.000001)
    return amount < 0 ? '<-0.000001' : '<0.000001'

  if (abs >= 1_000_000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const options: Intl.NumberFormatOptions
    = abs >= 1_000
      ? { minimumFractionDigits: 0, maximumFractionDigits: 2 }
      : abs >= 1
        ? { minimumFractionDigits: 0, maximumFractionDigits: 4 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 6 }

  return amount.toLocaleString('en-US', options)
}

// Convenience helper to format decimal strings (e.g., results of formatUnits) succinctly.
export function formatDecimalStringShort(value: string): string {
  const asNumber = Number.parseFloat(value)
  return formatTokenAmountShort(asNumber)
}

// Short formatter for bigint amounts given token decimals.
// Converts to decimal via formatUnits, then applies the short token amount rules.
export function formatBigintShort(amount: bigint, decimals: number): string {
  if (amount === 0n)
    return '0'
  const asNumber = Number.parseFloat(formatUnits(amount, decimals))
  return formatTokenAmountShort(asNumber)
}
