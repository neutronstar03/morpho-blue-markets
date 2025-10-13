import type { Route } from "./+types/market";
import { useState } from "react";
import { useCuratedMarkets, formatMarketData } from "../lib/hooks/use-market";
import { ConnectButton } from "../components/connect-button";
import { MarketDisplay } from "../components/market-display";
import { MarketList } from "../components/market-list";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Morpho Blue Markets" },
    { name: "description", content: "View and interact with Morpho Blue markets" },
  ];
}

export default function MarketPage() {
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  
  const { data: markets, isLoading, error } = useCuratedMarkets(20);

  const selectedMarket = markets?.find(m => m.id === selectedMarketId);

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            {isLoading && (
              <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                  {[...Array(5)].map((_, i) => (
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
            {markets && (
              <MarketList 
                markets={markets} 
                selectedMarketId={selectedMarketId}
                onMarketSelect={setSelectedMarketId}
              />
            )}
          </div>

          <div className="md:col-span-2">
            {selectedMarket ? (
              <MarketDisplay market={formatMarketData(selectedMarket)} />
            ) : (
              <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-8 text-center h-full flex items-center justify-center">
                <div className="text-gray-300">
                  <p className="text-lg font-medium mb-2">Select a market</p>
                  <p className="text-sm text-gray-400">
                    Choose a market from the list to view its details and interact with it.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
