'use client'

import type { ReactNode } from 'react'
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { useAccount, WagmiProvider } from 'wagmi'
import { useCollateralWhitelistPreload } from './collateral-whitelist'
import { BatchWithdrawProvider } from './contexts/batch-withdraw.context'
import { NetworkProvider } from './contexts/network'
import { SupplyAprOptimizerProvider } from './contexts/optimizer.context'
import { TransactionFeedbackProvider } from './contexts/transaction-feedback.context'
import { ViewingWalletProvider } from './contexts/viewing-wallet'
import { HomeMagicOptimizerEffects } from './home-magic-optimizer-effects'
import { useAnalytics } from './hooks/use-analytics'
import { useMarketBlacklistPreload } from './market-blacklist'
import { useOracleProvidersPreload } from './oracle-providers'
import { useSharedDecisionsPreload } from './reviews/use-shared-decisions'
import { useUnhealthyMarketsPreload } from './unhealthy-markets'
import { useUserBlacklistSyncEngine } from './user-blacklist-sync'
import { config } from './wagmi'

function GlobalDataEffects() {
  // Runs background magic scan side effects from inside provider context.
  // This component intentionally renders nothing.
  useCollateralWhitelistPreload()
  useMarketBlacklistPreload()
  useUnhealthyMarketsPreload()
  useOracleProvidersPreload()
  useSharedDecisionsPreload()
  useAnalytics()
  return null
}

function BlacklistSyncEffects() {
  // Keep the blacklist sync engine alive at the root so local blacklist
  // changes (collateral, oracle, lost-value) trigger background XHRs
  // even when the user has never opened Advanced Settings.
  const { address } = useAccount()
  useUserBlacklistSyncEngine(address)
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
                  <GlobalDataEffects />
                  <HomeMagicOptimizerEffects />
                  <BlacklistSyncEffects />
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
