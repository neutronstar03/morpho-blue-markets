import type { Route } from './+types/home'
import { useEffect } from 'react'
import { Header } from '~/components/header'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
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
  const { setRequiredChainId } = useNetworkContext()

  useEffect(() => {
    setRequiredChainId(null)
  }, [setRequiredChainId])

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
