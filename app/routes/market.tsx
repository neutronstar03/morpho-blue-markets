import type { Route } from './+types/market'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '~/components/header'
import { Card } from '~/components/ui/card'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
import { MarketDisplay } from '../components/market-display'
import {
  useMarketQuery,
} from '../lib/hooks/graphql/use-market'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Morpho Blue Market' },
    { name: 'description', content: 'View market details on Morpho Blue' },
  ]
}

export default function MarketPage() {
  const { uniqueKey, chainId } = useParams<{
    uniqueKey: string
    chainId: string
  }>()
  const { setRequiredChainId } = useNetworkContext()

  useEffect(() => {
    const requiredChainId = chainId ? Number(chainId) : null
    setRequiredChainId(requiredChainId)

    return () => {
      setRequiredChainId(null)
    }
  }, [chainId, setRequiredChainId])
  const {
    data: market,
    isLoading,
    error,
  } = useMarketQuery(uniqueKey, Number(chainId))

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <Header>
        <Link to="/" className="text-xl font-semibold text-white">
          &larr; Back to Markets
        </Link>
      </Header>

      {/* Main Content */}
      <Main>
        {isLoading && (
          <Card className="p-6">
            <p className="text-white">Loading market...</p>
          </Card>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
            <div className="text-red-200">
              <p className="font-medium">Error loading market</p>
              <p className="text-sm mt-1">{error.message}</p>
            </div>
          </div>
        )}
        {market
          ? (
              <MarketDisplay market={market} />
            )
          : (
              !isLoading && (
                <Card className="p-6">
                  <p className="text-white">Market not found.</p>
                </Card>
              )
            )}
      </Main>
    </div>
  )
}
