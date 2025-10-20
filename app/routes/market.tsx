import type { Route } from './+types/market'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '~/components/header'
import { useNetworkContext } from '~/lib/contexts/network'
import { MarketDisplay } from '../components/market-display'
import {
  formatGqlMarket,
  formatMarketData,
  useMarketQuery,
} from '../lib/hooks/use-single-market'

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
  } = useMarketQuery(uniqueKey!, Number(chainId))

  const formattedMarket = market
    ? formatMarketData(formatGqlMarket(market))
    : null

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <Header>
        <Link to="/" className="text-xl font-semibold text-white">
          &larr; Back to Markets
        </Link>
      </Header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && (
          <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
            <p className="text-white">Loading market...</p>
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
            <div className="text-red-200">
              <p className="font-medium">Error loading market</p>
              <p className="text-sm mt-1">{error.message}</p>
            </div>
          </div>
        )}
        {formattedMarket
          ? (
              <MarketDisplay market={formattedMarket} />
            )
          : (
              !isLoading && (
                <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
                  <p className="text-white">Market not found.</p>
                </div>
              )
            )}
      </main>
    </div>
  )
}
