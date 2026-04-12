// Analytics hooks for wallet/chain tracking.
// Must be called inside a WagmiProvider context.

import { useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { trackEvent } from '~/lib/analytics'

/**
 * Tracks wallet connection, disconnection, and network switches.
 * Call once inside the provider tree (e.g. Providers component).
 *
 * - Fires `wallet_connect` when the user connects a wallet.
 * - Fires `wallet_disconnect` when the user disconnects.
 * - Fires `network_switch` when the user changes chain.
 * - Uses refs to avoid double-fires from React strict mode / re-renders.
 */
export function useAnalytics(): void {
  const { isConnected, connector } = useAccount()
  const chainId = useChainId()

  const prevConnectedRef = useRef(isConnected)
  const prevChainIdRef = useRef(chainId)

  // Track wallet connect / disconnect
  useEffect(() => {
    // Debounce: skip the initial mount when already connected
    // (e.g. page refresh with a cached wallet)
    if (prevConnectedRef.current === undefined) {
      // First mount — don't track, but record the state
      prevConnectedRef.current = isConnected
      return
    }

    if (isConnected && !prevConnectedRef.current) {
      trackEvent('wallet_connect', {
        connector: connector?.name ?? 'unknown',
      })
    }
    else if (!isConnected && prevConnectedRef.current) {
      trackEvent('wallet_disconnect')
    }

    prevConnectedRef.current = isConnected
  }, [isConnected, connector?.name])

  // Track network switch
  useEffect(() => {
    // Skip the initial mount (first chain ID is just the starting point)
    if (prevChainIdRef.current === undefined) {
      prevChainIdRef.current = chainId
      return
    }

    if (chainId !== prevChainIdRef.current) {
      trackEvent('network_switch', {
        chainId,
        fromChainId: prevChainIdRef.current,
      })
      prevChainIdRef.current = chainId
    }
  }, [chainId])
}
