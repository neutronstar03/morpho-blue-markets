import * as React from 'react'

interface PercentageControlProps {
  label?: string
  percentage: string
  onChange: (value: string) => void
  onMax: () => void
  leftHelper?: React.ReactNode
  rightHelper?: React.ReactNode
  desktopCta?: React.ReactNode
}

export function PercentageControl({
  label = 'Percentage',
  percentage,
  onChange,
  onMax,
  leftHelper,
  rightHelper,
  desktopCta,
}: PercentageControlProps) {
  const percentNumber = Number.parseFloat(percentage) || 0

  const handlePercentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    // Allow empty input, digits, decimal point, and decimal numbers
    if (/^(?:\d+(?:\.\d*)?|\.\d*)$/.test(value) || value === '') {
      onChange(value)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="percentage-control" className="block text-sm font-medium text-gray-200">
          {label}
        </label>

        <div className="md:flex md:items-end md:gap-4">
          <div className="flex items-center justify-between gap-3 flex-1 min-w-0">
            <div className="relative w-full md:max-w-sm">
              <input
                type="text"
                inputMode="decimal"
                id="percentage-control"
                value={percentage}
                onChange={handlePercentInputChange}
                placeholder="0.0"
                className="w-full px-3 py-2 pr-7 border border-white/10 bg-white/5 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-sm text-gray-400">%</span>
            </div>

            <button
              type="button"
              onClick={onMax}
              className="px-3 h-9 inline-flex items-center justify-center rounded-md border border-white/10 text-sm text-gray-200 hover:bg-white/10 cursor-pointer"
            >
              Max
            </button>
          </div>

          {/* Desktop CTA slot */}
          {desktopCta && (
            <div className="hidden md:block md:w-64">
              {desktopCta}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="range"
          min={0}
          max={100}
          step={0.01}
          value={Number.isFinite(percentNumber) ? percentNumber : 0}
          onChange={e => onChange(e.target.value)}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-600"
          style={{ ['--fill' as any]: `${percentNumber}%` }}
          aria-label="Percentage slider"
        />
        <div className="flex justify-between text-xs text-gray-400">
          {[0, 25, 50, 75, 100].map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(p))}
              className="cursor-pointer px-1 py-0.5 rounded hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              {p}
              %
            </button>
          ))}
        </div>
      </div>

      {(leftHelper || rightHelper) && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{leftHelper}</span>
          <span className="text-gray-300">{rightHelper}</span>
        </div>
      )}
    </div>
  )
}
