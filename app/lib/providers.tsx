'use client'

import type { ReactNode } from 'react'
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { WagmiProvider } from 'wagmi'
import { BatchWithdrawProvider } from './contexts/batch-withdraw.context'
import { NetworkProvider } from './contexts/network'
import { SupplyAprOptimizerProvider } from './contexts/optimizer.context'
import { config } from './wagmi'

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
          <SupplyAprOptimizerProvider>
            <BatchWithdrawProvider>
              <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
            </BatchWithdrawProvider>
          </SupplyAprOptimizerProvider>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
