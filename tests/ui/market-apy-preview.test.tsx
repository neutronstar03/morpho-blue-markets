import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarketApyPreview } from '../../app/components/ui/market-apy-preview'

describe('test MarketApyPreview component', () => {
  it('renders utilization and APY with estimate label', () => {
    render(
      <MarketApyPreview
        beforeUtil={1}
        afterUtil={0.9412}
        beforeApy={4.8582}
        afterApy={11.814}
        showEstimateLabel
      />,
    )

    expect(screen.getByText('Utilization')).toBeInTheDocument()
    expect(screen.getByText('Supply APY')).toBeInTheDocument()
    expect(screen.getByText(/100\.00%/)).toBeInTheDocument()
    expect(screen.getByText(/94\.12%/)).toBeInTheDocument()
    expect(screen.getByText(/485\.82%/)).toBeInTheDocument()
    expect(screen.getByText(/1,181\.40%/)).toBeInTheDocument()
    expect(screen.getByText('(est.)')).toBeInTheDocument()
  })

  it('renders placeholders when APY missing', () => {
    render(
      <MarketApyPreview
        beforeUtil={1}
        afterUtil={1}
      />,
    )

    const apyRow = screen.getByText('Supply APY').parentElement
    expect(apyRow).not.toBeNull()
    if (apyRow) {
      const count = (apyRow.textContent?.match(/----/g) ?? []).length
      expect(count).toBe(2)
    }
  })
})
