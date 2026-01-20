import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarketAprPreview } from '../../app/components/ui/market-apr-preview'

describe('test MarketAprPreview component', () => {
  it('renders utilization and APR with estimate label', () => {
    render(
      <MarketAprPreview
        beforeUtil={1}
        afterUtil={0.9412}
        beforeApr={4.8582}
        afterApr={11.814}
        showEstimateLabel
      />,
    )

    expect(screen.getByText('Utilization')).toBeInTheDocument()
    expect(screen.getByText('Supply APR')).toBeInTheDocument()
    expect(screen.getByText(/100\.00%/)).toBeInTheDocument()
    expect(screen.getByText(/94\.12%/)).toBeInTheDocument()
    expect(screen.getByText(/485\.82%/)).toBeInTheDocument()
    expect(screen.getByText(/1,181\.40%/)).toBeInTheDocument()
    expect(screen.getByText('(est.)')).toBeInTheDocument()
  })

  it('renders placeholders when APR missing', () => {
    render(
      <MarketAprPreview
        beforeUtil={1}
        afterUtil={1}
      />,
    )

    const aprRow = screen.getByText('Supply APR').parentElement
    expect(aprRow).not.toBeNull()
    if (aprRow) {
      const count = (aprRow.textContent?.match(/----/g) ?? []).length
      expect(count).toBe(2)
    }
  })
})
