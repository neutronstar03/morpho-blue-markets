import type { Route } from "./+types/market";
import { useState } from "react";
import { useMarket, formatMarketData } from "../lib/hooks/use-market";
import { ConnectButton } from "../components/connect-button";
import { MarketDisplay } from "../components/market-display";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Morpho Blue Market" },
    { name: "description", content: "View and interact with Morpho Blue markets" },
  ];
}

export default function MarketPage() {
  const [marketId, setMarketId] = useState<string>("");
  const [network, setNetwork] = useState<'mainnet' | 'base'>('mainnet');

  const { data: market, isLoading, error } = useMarket(
    marketId || undefined,
    network
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (marketId.trim()) {
      // The useMarket hook will automatically fetch when marketId changes
    }
  };

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
        {/* Market ID Input */}
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="marketId" className="block text-sm font-medium text-gray-300 mb-2">
                  Market ID
                </label>
                <input
                  type="text"
                  id="marketId"
                  value={marketId}
                  onChange={(e) => setMarketId(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
                />
              </div>
              <div>
                <label htmlFor="network" className="block text-sm font-medium text-gray-300 mb-2">
                  Network
                </label>
                <select
                  id="network"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value as 'mainnet' | 'base')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="mainnet">Ethereum Mainnet</option>
                  <option value="base">Base</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!marketId.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                Load Market
              </button>
            </div>
          </form>
        </div>

        {/* Market Display */}
        {isLoading && (
          <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-700 rounded w-1/3"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
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

        {market && (
          <MarketDisplay market={formatMarketData(market)} />
        )}

        {!marketId && !isLoading && !error && (
          <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-8 text-center">
            <div className="text-gray-300">
              <p className="text-lg font-medium mb-2">Enter a Market ID to get started</p>
              <p className="text-sm text-gray-400 mb-4">Enter a Morpho Blue market ID above to view market details and interact with it.</p>
              <div className="mt-4 p-4 bg-gray-900/50 border border-gray-700 rounded-lg text-left">
                <p className="text-xs text-gray-400 mb-2">Example market ID (USDC/KTA on Base):</p>
                <code className="text-xs text-green-400 font-mono break-all">
                  0x6b52694164c1c86d6e834b05b8d35eb5d178ca2587a059143ac8b159a4dcf225
                </code>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
