import type { Route } from './+types/home'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { Header } from '~/components/header'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
import { formatUsd } from '~/lib/formatters'
import { useLocalStorage } from '~/lib/hooks/use-local-storage'
import { useHomeMagicOptimizerStore } from '~/lib/stores/home-magic-optimizer.store'
import { AdvancedList } from '~/pages/home/advanced-list'
import { BatchWithdraw } from '~/pages/home/batch-withdraw'
import { BlacklistRecap } from '~/pages/home/blacklist-recap'
import { Position } from '~/pages/home/position'
import { SupplyAprOptimizer } from '~/pages/home/supply-apr-optimizer'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Morpho Blue Markets' },
    { name: 'description', content: 'Welcome to Morpho Blue Markets' },
  ]
}

export default function HomePage() {
  const { setRequiredChainId } = useNetworkContext()
  const { chain } = useAccount()
  const opportunities = useHomeMagicOptimizerStore(state => state.opportunities)
  const dismissOpportunity = useHomeMagicOptimizerStore(state => state.dismissOpportunity)
  const setOptimizerPreset = useHomeMagicOptimizerStore(state => state.setOptimizerPreset)
  const [showBlacklistRecap, setShowBlacklistRecap] = useLocalStorage<boolean>('home:show-blacklist-recap', false)
  const blacklistRecapRef = useRef<HTMLDivElement | null>(null)
  const shouldScrollToBlacklistRecapRef = useRef(false)
  const showBlacklistRecapRef = useRef(showBlacklistRecap)

  const chainOpportunities = opportunities.filter(o => o.chainId === chain?.id)

  useEffect(() => {
    setRequiredChainId(null)
  }, [setRequiredChainId])

  useEffect(() => {
    showBlacklistRecapRef.current = showBlacklistRecap
  }, [showBlacklistRecap])

  useEffect(() => {
    const scrollToBlacklistRecap = () => {
      const el = blacklistRecapRef.current
      if (!el)
        return false
      const top = el.getBoundingClientRect().top + window.scrollY - 88
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
      return true
    }

    const openBlacklistRecap = () => {
      shouldScrollToBlacklistRecapRef.current = true
      if (showBlacklistRecapRef.current) {
        scrollToBlacklistRecap()
        return
      }
      setShowBlacklistRecap(true)
    }

    const onHashChange = () => {
      if (window.location.hash === '#blacklist-recap')
        openBlacklistRecap()
    }

    window.addEventListener('open-blacklist-recap', openBlacklistRecap)
    window.addEventListener('hashchange', onHashChange)
    if (window.location.hash === '#blacklist-recap')
      openBlacklistRecap()

    return () => {
      window.removeEventListener('open-blacklist-recap', openBlacklistRecap)
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [setShowBlacklistRecap])

  useEffect(() => {
    if (!showBlacklistRecap || !shouldScrollToBlacklistRecapRef.current)
      return

    let raf2 = 0
    const tryScroll = () => {
      const el = blacklistRecapRef.current
      if (!el)
        return
      shouldScrollToBlacklistRecapRef.current = false
      const top = el.getBoundingClientRect().top + window.scrollY - 88
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    }

    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(tryScroll)
    })

    return () => {
      window.cancelAnimationFrame(raf1)
      if (raf2)
        window.cancelAnimationFrame(raf2)
    }
  }, [showBlacklistRecap])

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
      marketApr: '10',
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
          {chainOpportunities.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {chainOpportunities.map((opportunity, index) => {
                const isOddLastCard = chainOpportunities.length % 2 === 1 && index === chainOpportunities.length - 1

                return (
                  <Card
                    key={opportunity.id}
                    className={`border border-green-700/40 bg-green-950/20 ${isOddLastCard ? 'md:col-span-2' : ''}`}
                  >
                    <div
                      className="flex w-full items-start gap-2 p-2.5 text-left cursor-pointer sm:gap-3 sm:p-4"
                      onClick={() => handleOpenOptimizer(opportunity)}
                    >
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-green-100 sm:text-base">
                          Optimizable:
                          {' '}
                          {opportunity.loanAssetSymbol}
                        </h2>
                        <div className="mt-1 space-y-0.5 text-xs text-green-200/90 sm:text-sm">
                          <p>
                            Estimated APR improvement
                            {' '}
                            +
                            {opportunity.aprGainPct.toFixed(2)}
                            %
                          </p>
                          <p>
                            Improvement over previous
                            {' '}
                            {opportunity.relativeImprovementPct != null
                              ? `+${opportunity.relativeImprovementPct.toFixed(2)}%`
                              : '--'}
                          </p>
                          <p>
                            Daily Return
                            {' '}
                            +
                            {formatUsd(opportunity.yearlyReturnGainUsd / 365)}
                            {' '}
                            /
                            {' '}
                            Yearly Return
                            {' '}
                            +
                            {formatUsd(opportunity.yearlyReturnGainUsd)}
                          </p>
                        </div>
                      </div>
                      <div className="ml-auto flex items-start gap-2 self-stretch">
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
                )
              })}
            </div>
          )}

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
          {showBlacklistRecap && (
            <div ref={blacklistRecapRef} id="blacklist-recap" className="mt-8">
              <BlacklistRecap onClose={() => setShowBlacklistRecap(false)} />
            </div>
          )}
        </div>
      </Main>
    </>
  )
}
