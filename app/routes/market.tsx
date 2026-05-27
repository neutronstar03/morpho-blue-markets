import type { Route } from './+types/market'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '~/components/header'
import { Card } from '~/components/ui/card'
import { Main } from '~/components/ui/main'
import { useNetworkContext } from '~/lib/contexts/network'
import { MarketDisplay } from '~/pages/market/market-display'
import {
  useMarketQuery,
} from '../lib/hooks/graphql/use-market'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Morpho Blue Market' },
    { name: 'description', content: 'View market details on Morpho Blue' },
  ]
}

function getMarketLoadErrorCopy(error: Error) {
  const message = error.message
  if (message.includes('GRAPHQL_VALIDATION_FAILED') || message.includes('Cannot query field')) {
    return 'Morpho changed part of its GraphQL API, so this market view cannot load until the app is updated.'
  }
  return 'Market data is temporarily unavailable. Please retry in a moment.'
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
    refetch,
  } = useMarketQuery(uniqueKey, Number(chainId))
  const errorCopy = error ? getMarketLoadErrorCopy(error) : null

  return (
    <>
      {/* Header */}
      <Header>
        <Link
          to="/"
          className="text-lg sm:text-xl font-semibold text-white hover:text-gray-200 transition-colors"
        >
          <span className="sm:hidden">&larr; Back</span>
          <span className="hidden sm:inline">&larr; Back to Markets</span>
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
          <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-6">
            <div className="space-y-4 text-amber-100">
              <div>
                <p className="font-medium">Market data unavailable</p>
                <p className="mt-1 text-sm text-amber-100/80">{errorCopy}</p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  className="rounded-md border border-amber-300/40 px-3 py-1.5 text-amber-50 transition-colors hover:bg-amber-300/10"
                  onClick={() => void refetch()}
                >
                  Retry
                </button>
                <Link
                  to="/"
                  className="rounded-md border border-white/10 px-3 py-1.5 text-white/80 transition-colors hover:bg-white/10"
                >
                  Back to Markets
                </Link>
              </div>
              {import.meta.env.DEV && (
                <details className="text-xs text-amber-100/70">
                  <summary className="cursor-pointer">Developer details</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3">{error.message}</pre>
                </details>
              )}
            </div>
          </div>
        )}
        {market
          ? (
              <MarketDisplay market={market} />
            )
          : (
              !isLoading && !error && (
                <Card className="p-6">
                  <p className="text-white">Market not found.</p>
                </Card>
              )
            )}
      </Main>
    </>
  )
}
