import type { Route } from './+types/home'
import { ConnectButton } from '../components/connect-button'
import { List } from '../components/list'
import { Position } from '../components/position'
import { useCuratedMarkets } from '../lib/hooks/use-market'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'Morpho Blue Markets' },
    { name: 'description', content: 'Welcome to Morpho Blue Markets' },
  ]
}

export default function HomePage() {
  const { data: markets, isLoading, error } = useCuratedMarkets(100)

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-white">
                Morpho Blue Markets
              </h1>
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full">
          <Position />
          {isLoading && (
            <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                {[...Array.from({ length: 5 })].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-700 rounded"></div>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
              <div className="text-red-200">
                <p className="font-medium">Error loading markets</p>
                <p className="text-sm mt-1">{error.message}</p>
              </div>
            </div>
          )}
          {markets && <List markets={markets} />}
        </div>
      </main>
    </div>
  )
}
