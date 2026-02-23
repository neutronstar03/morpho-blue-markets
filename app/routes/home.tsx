import type { Route } from './+types/home'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '~/components/header'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
import { useHomeMagicOptimizerScan } from '~/lib/hooks/use-home-magic-optimizer-scan'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { AdvancedList } from '~/pages/home/advanced-list'
import { BatchWithdraw } from '~/pages/home/batch-withdraw'
import { Position } from '~/pages/home/position'
import { SupplyAprOptimizer } from '~/pages/home/supply-apr-optimizer'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Morpho Blue Markets' },
    { name: 'description', content: 'Welcome to Morpho Blue Markets' },
  ]
}

export default function HomePage() {
  useHomeMagicOptimizerScan()

  const { setRequiredChainId } = useNetworkContext()
  const { chain } = useAccount()
  const opportunities = useHomeMagicOptimizerStore(state => state.opportunities)
  const dismissOpportunity = useHomeMagicOptimizerStore(state => state.dismissOpportunity)
  const setOptimizerPreset = useHomeMagicOptimizerStore(state => state.setOptimizerPreset)

  const chainOpportunities = opportunities.filter(o => o.chainId === chain?.id)

  useEffect(() => {
    setRequiredChainId(null)
  }, [setRequiredChainId])

  const handleOpenOptimizer = (opportunity: {
    id: string
    chainId: number
    loanAssetAddress: string
    loanAssetSymbol: string
    loanAssetDecimals: number
  }) => {
    setOptimizerPreset({
      chainId: opportunity.chainId,
      loanAssetAddress: opportunity.loanAssetAddress,
      loanAssetSymbol: opportunity.loanAssetSymbol,
      loanAssetDecimals: opportunity.loanAssetDecimals,
      newDepositAmount: '0',
      maxMarketsUsed: 6,
      usePrecomputedIfFresh: true,
    })

    dismissOpportunity(opportunity.id)

    window.requestAnimationFrame(() => {
      const el = document.querySelector('[data-testid="supply-apr-optimizer-card"]') as HTMLElement | null
      if (!el)
        return
      const top = el.getBoundingClientRect().top + window.scrollY - 88
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    })
  }

  return (
    <>
      {/* Header */}
      <Header>
        <h1 className="text-xl font-semibold text-white">
          Morpho Blue Markets
        </h1>
      </Header>

      {/* Main Content */}
      <Main>
        <div className="w-full">
          {chainOpportunities.map(opportunity => (
            <Card key={opportunity.id} className="mb-4 border border-green-700/40 bg-green-950/20">
              <div
                className="w-full p-4 flex items-start gap-3 text-left cursor-pointer"
                onClick={() => handleOpenOptimizer(opportunity)}
              >
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-green-100">
                    New optimal allocation found for
                    {' '}
                    {opportunity.loanAssetSymbol}
                  </h2>
                  <p className="text-sm text-green-200/90 mt-1">
                    Estimated blended APR improvement:
                    {' +'}
                    {opportunity.aprGainPct.toFixed(2)}
                    %
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      dismissOpportunity(opportunity.id)
                    }}
                    className="h-8 w-8 px-0"
                    aria-label={`Dismiss ${opportunity.loanAssetSymbol} opportunity`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          <Position />
          <div className="mt-8">
            <BatchWithdraw />
          </div>
          <div className="mt-8">
            <SupplyAprOptimizer />
          </div>
          <div className="mt-8">
            <AdvancedList />
          </div>
        </div>
      </Main>
    </>
  )
}
