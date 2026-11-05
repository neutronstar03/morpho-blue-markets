import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketOrderBy, OrderDirection } from '../../app/lib/hooks/graphql/use-list-markets'
import { MarketFilters } from '../../app/pages/home/advanced-list/market-filters'
import { MarketTable } from '../../app/pages/home/advanced-list/market-table'
import { MarketActionTabs } from '../../app/pages/market/components/market-action-tabs'

afterEach(() => cleanup())
function Tabs({ blocked = false }: { blocked?: boolean }) {
  const [value, onChange] = useState<'deposit' | 'withdraw'>('deposit')
  return <MarketActionTabs value={value} onChange={onChange} supplyBlocked={blocked} supplyPanel="Supply form" withdrawPanel="Withdraw form" />
}

describe('market controls', () => {
  it('selects related action panels with arrow and Home/End keys', () => {
    render(<Tabs />)
    const supply = screen.getByRole('tab', { name: 'Supply', selected: true })
    const withdraw = screen.getByRole('tab', { name: 'Withdraw', selected: false })
    expect(screen.getByRole('tabpanel', { name: 'Supply' })).toHaveAttribute('id', supply.getAttribute('aria-controls'))
    supply.focus()
    fireEvent.keyDown(supply, { key: 'ArrowRight' })
    expect(withdraw).toHaveFocus()
    expect(withdraw).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Withdraw' })).toHaveTextContent('Withdraw form')
    fireEvent.keyDown(withdraw, { key: 'Home' })
    expect(supply).toHaveFocus()
    expect(supply).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(supply, { key: 'End' })
    expect(withdraw).toHaveFocus()
  })
  it('keeps withdrawal keyboard reachable when supply is blocked', () => {
    render(<Tabs blocked />)
    expect(screen.getByRole('tab', { name: 'Supply' })).toBeDisabled()
    const withdraw = screen.getByRole('tab', { name: 'Withdraw' })
    expect(withdraw.tabIndex).toBe(0)
    fireEvent.keyDown(withdraw, { key: 'ArrowLeft' })
    expect(withdraw).toHaveAttribute('aria-selected', 'true')
  })
  it('names filter controls and mobile threshold quantities/units', () => {
    render(<MarketFilters aprType="supply" setAprType={vi.fn()} comparison=">" setComparison={vi.fn()} aprValue={12} setAprValue={vi.fn()} orderBy={MarketOrderBy.NetSupplyApy} setOrderBy={vi.fn()} orderDirection={OrderDirection.Desc} setOrderDirection={vi.fn()} chainFilter="ALL" setChainFilter={vi.fn()} rateType="supply" searchQuery="" setSearchQuery={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Search markets' })).toBeInTheDocument()
    for (const name of ['Chain', 'APY type', 'APY comparison', 'Sort markets by', 'Sort direction'])
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Supply APY threshold percent' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('spinbutton', { name: 'Supply APY threshold percent' })).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'APY comparison' })).toBeInTheDocument()
  })
  it('names dense tables and exposes a keyboard focusable scroll region', () => {
    render(<MemoryRouter><MarketTable markets={[]} isLoading={false} rateType="supply" immediateAprByMarketKey={{}} canComputeLiveApr={false} hideChainColumn={false} riskStatusByKey={{}} /></MemoryRouter>)
    expect(screen.getByRole('table', { name: 'Morpho markets' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Market table, scroll horizontally/ })).toHaveAttribute('tabindex', '0')
  })
})
