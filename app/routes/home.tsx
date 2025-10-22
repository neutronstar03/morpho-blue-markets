import type { Route } from './+types/home'
import { useEffect } from 'react'
import { AdvancedList } from '~/components/advanced-list'
import { Header } from '~/components/header'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
import { Position } from '../components/position'

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
    <div className="min-h-screen bg-gray-900">
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
            <AdvancedList />
          </div>
        </div>
      </Main>
    </div>
  )
}
