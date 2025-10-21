# Plan for fetching user positions with on-chain data

This document outlines the plan to create a single React hook that fetches a user's DeFi positions in a highly efficient and real-time manner.

## Problem

The current implementation queries the Morpho subgraph for user positions. This approach suffers from significant data latency, with updates taking as long as 20-30 minutes. For a DeFi application, this is too slow to provide a good user experience, as users need to see the results of their actions (deposits, borrows, etc.) immediately.

## Proposed Solution

The plan is to implement a single, unified React hook (`useLiveMarketPositions`) that combines two data-fetching strategies to get the best of both worlds: subgraph querying for discovery and direct blockchain calls for live data.

### Two-Step Process

1.  **Market Discovery (via Subgraph):**
    *   The hook will first query the Morpho subgraph to get a list of all available markets on a specific chain.
    *   This query will fetch essential market data, including `uniqueKey`, APY metrics for sorting (e.g., `netSupplyApy`), and state variables required for later calculations (like `totalAssets` and `totalShares`).
    *   This list of markets will be sorted by descending supply APY. This part of the data is not user-specific and can be cached effectively.

2.  **Live Position Reading (via Multicall):**
    *   Once the list of markets is retrieved, the hook will use the connected user's address to prepare a batch of read calls to the Morpho Blue smart contract.
    *   For each market, it will call the `position(bytes32 id, address user)` view function to get the user's `supplyShares`, `borrowShares`, and `collateral`.
    *   These individual calls will be bundled into a single, efficient RPC request using a `multicall` pattern. Since the project uses `wagmi`, this will be implemented with the `useReadContracts` hook, which handles the batching and chunking automatically.

### Conceptual Implementation

Here is a sketch of what the final hook might look like:

```tsx
import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { morphoAbi } from './morpho.abi.json' // The ABI for the Morpho Blue contract
import { useListMarkets } from './use-list-markets' // Assuming this hook exists and fetches all markets

// The canonical address for Morpho Blue on the target chain
const MORPHO_BLUE_ADDRESS = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb'

export function useLiveMarketPositions() {
  const { address: userAddress, chain } = useAccount()

  // 1. DISCOVERY: Fetch all markets from the subgraph
  const { data: markets, isLoading: isLoadingMarkets } = useListMarkets(chain?.id)

  // 2. PREPARATION: Sort markets and prepare multicall configuration
  const multicallContracts = useMemo(() => {
    if (!markets || !userAddress)
      return []

    // Sort markets by supply APY as requested
    const sortedMarkets = [...markets].sort((a, b) => b.state.netSupplyApy - a.state.netSupplyApy)

    return sortedMarkets.map(market => ({
      address: MORPHO_BLUE_ADDRESS,
      abi: morphoAbi,
      functionName: 'position',
      args: [market.uniqueKey, userAddress] as const,
    }))
  }, [markets, userAddress])

  // 3. READING: `useReadContracts` performs the multicall
  const { data: positionResults, isLoading: isLoadingPositions } = useReadContracts({
    contracts: multicallContracts,
    allowFailure: true, // Recommended to prevent the entire batch from failing if one call reverts
    query: {
      enabled: !!markets && !!userAddress, // Query is only enabled when we have markets and a user
    },
  })

  // 4. PROCESSING: Combine market data with on-chain position data
  const userPositions = useMemo(() => {
    if (!markets || !positionResults)
      return []

    return markets
      .map((market, index) => {
        const result = positionResults[index]
        if (result.status !== 'success')
          return null

        const [supplyShares, borrowShares, collateral] = result.result
        const hasPosition = supplyShares > 0n || borrowShares > 0n || collateral > 0n

        if (!hasPosition)
          return null

        // Combine the rich market data from the subgraph with the live on-chain user state
        return {
          market,
          userState: { supplyShares, borrowShares, collateral },
          // Here you can add computed values, e.g., converting shares to asset amounts
        }
      })
      .filter(Boolean) // Filter out markets where the user has no position or the call failed
  }, [markets, positionResults])

  return {
    data: userPositions,
    isLoading: isLoadingMarkets || isLoadingPositions,
  }
}
```

## Benefits of this approach

*   **Real-Time Data:** User balances will update almost instantly after a transaction is confirmed.
*   **Efficiency:** A single `multicall` RPC request is significantly more efficient than making dozens of individual `eth_call`s, preventing rate-limiting issues.
*   **Scalability:** The solution scales well with the number of markets. `useReadContracts` can handle chunking if the number of calls becomes very large.
*   **Improved User Experience:** The UI will feel responsive and reliable.
