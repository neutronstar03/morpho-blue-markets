'use client'

import type { ReactNode } from 'react'
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { useCollateralWhitelistPreload } from './collateral-whitelist'
import { BatchWithdrawProvider } from './contexts/batch-withdraw.context'
import { NetworkProvider } from './contexts/network'
import { SupplyAprOptimizerProvider } from './contexts/optimizer.context'
import { TransactionFeedbackProvider } from './contexts/transaction-feedback.context'
import { ViewingWalletProvider } from './contexts/viewing-wallet'
import { useAnalytics } from './hooks/use-analytics'
import { useHomeMagicOptimizerScan } from './hooks/use-home-magic-optimizer-scan'
import { useMarketBlacklistPreload } from './market-blacklist'
import { useOracleProvidersPreload } from './oracle-providers'
import { config } from './wagmi'

function HomeMagicOptimizerEffects() {
  // Runs background magic scan side effects from inside provider context.
  // This component intentionally renders nothing.
  useCollateralWhitelistPreload()
  useMarketBlacklistPreload()
  useOracleProvidersPreload()
  useHomeMagicOptimizerScan()
  useAnalytics()
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 10 * 60 * 1000, // 10 minutes
          },
        },
      }),
  )

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <TransactionFeedbackProvider>
            <ViewingWalletProvider>
              <SupplyAprOptimizerProvider>
                <BatchWithdrawProvider>
                  <HomeMagicOptimizerEffects />
                  <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
                </BatchWithdrawProvider>
              </SupplyAprOptimizerProvider>
            </ViewingWalletProvider>
          </TransactionFeedbackProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
