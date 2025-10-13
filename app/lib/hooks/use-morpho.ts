import { useWriteContract, useSimulateContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import { useState } from 'react'

// Morpho Blue contract addresses (you may need to update these)
export const MORPHO_BLUE_ADDRESSES = {
  mainnet: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb', // Morpho Blue mainnet
  base: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb', // Same address on Base
} as const

// Get the correct Morpho Blue address for the current chain
export function getMorphoBlueAddress(chainId?: number): `0x${string}` {
  switch (chainId) {
    case 1: // Ethereum mainnet
      return MORPHO_BLUE_ADDRESSES.mainnet as `0x${string}`
    case 8453: // Base
      return MORPHO_BLUE_ADDRESSES.base as `0x${string}`
    default:
      return MORPHO_BLUE_ADDRESSES.mainnet as `0x${string}`
  }
}

// ERC20 ABI for token interactions
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }]
  }
] as const

// Morpho Blue ABI (simplified for MVP)
const MORPHO_BLUE_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' }
        ]
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: []
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' }
        ]
      },
      { name: 'assets', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
      { name: 'onBehalf', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: []
  },
  {
    name: 'position',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' }
        ]
      }
    ],
    outputs: [
      { name: 'supplyShares', type: 'uint256' },
      { name: 'borrowShares', type: 'uint256' },
      { name: 'collateral', type: 'uint256' }
    ]
  }
] as const

export interface MarketParams {
  loanToken: string
  collateralToken: string
  oracle: string
  irm: string
  lltv: string
}

export interface UserPosition {
  supplyShares: string
  borrowShares: string
  collateral: string
}

// Hook for token approval
export function useTokenApproval(tokenAddress: string, spender: string, amount: string, userAddress?: string) {
  const { data: allowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress as `0x${string}`, spender as `0x${string}`] : undefined,
    query: {
      enabled: !!userAddress,
    },
  })

  const { data: simulateData } = useSimulateContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as `0x${string}`, parseEther(amount)],
  })

  const { writeContract: approve, data: hash, isPending, error } = useWriteContract()

  const handleApprove = () => {
    if (simulateData?.request) {
      approve(simulateData.request)
    }
  }

  return {
    allowance: allowance ? formatEther(allowance) : '0',
    needsApproval: allowance ? parseEther(amount) > allowance : true,
    approve: handleApprove,
    hash,
    isPending,
    error
  }
}

// Hook for checking token balance in wallet
export function useTokenBalance(tokenAddress: string, userAddress?: string) {
  return useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!userAddress,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  })
}

// Token decimals configuration (for non-18 decimal tokens)
export const TOKEN_DECIMALS: Record<string, number> = {
  // USDC and other 6-decimal tokens
  '0xa0b86a33e6c33364a5cc5c6c5d5f5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c': 6, // USDC on Ethereum
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC on Base
  // Add more tokens here as needed
}

// Format token balance with proper decimals
export function formatTokenBalance(balance: bigint | undefined, tokenAddress: string): string {
  if (!balance) return '0'

  const decimals = TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18

  if (decimals === 18) {
    return formatEther(balance)
  } else {
    // For non-18 decimal tokens, we need to format manually
    const divisor = BigInt(10) ** BigInt(decimals)
    const formatted = Number(balance) / Number(divisor)
    return formatted.toFixed(decimals > 6 ? 6 : decimals) // Limit decimal places for display
  }
}

// Hook for supplying to a market
export function useSupply(marketParams: MarketParams, amount: string) {
  const { data: simulateData } = useSimulateContract({
    address: getMorphoBlueAddress(),
    abi: MORPHO_BLUE_ABI,
    functionName: 'supply',
    args: [
      {
        loanToken: marketParams.loanToken as `0x${string}`,
        collateralToken: marketParams.collateralToken as `0x${string}`,
        oracle: marketParams.oracle as `0x${string}`,
        irm: marketParams.irm as `0x${string}`,
        lltv: BigInt(marketParams.lltv)
      },
      parseEther(amount),
      BigInt(0), // shares (0 for max)
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // onBehalf
      '0x' // data
    ],
  })

  const { writeContract: supply, data: hash, isPending, error } = useWriteContract()

  const handleSupply = () => {
    if (simulateData?.request) {
      supply(simulateData.request)
    }
  }

  return {
    supply: handleSupply,
    hash,
    isPending,
    error
  }
}

// Hook for withdrawing from a market
export function useWithdraw(marketParams: MarketParams, amount: string) {
  const { data: simulateData } = useSimulateContract({
    address: MORPHO_BLUE_ADDRESSES.mainnet as `0x${string}`,
    abi: MORPHO_BLUE_ABI,
    functionName: 'withdraw',
    args: [
      {
        loanToken: marketParams.loanToken as `0x${string}`,
        collateralToken: marketParams.collateralToken as `0x${string}`,
        oracle: marketParams.oracle as `0x${string}`,
        irm: marketParams.irm as `0x${string}`,
        lltv: BigInt(marketParams.lltv)
      },
      parseEther(amount),
      BigInt(0), // shares (0 for max)
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // onBehalf
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // receiver (user's address)
      '0x' // data
    ],
  })

  const { writeContract: withdraw, data: hash, isPending, error } = useWriteContract()

  const handleWithdraw = () => {
    if (simulateData?.request) {
      withdraw(simulateData.request)
    }
  }

  return {
    withdraw: handleWithdraw,
    hash,
    isPending,
    error
  }
}

// Hook for getting user's position in a market
export function useUserPosition(marketParams: MarketParams, userAddress: string | undefined) {
  return useReadContract({
    address: MORPHO_BLUE_ADDRESSES.mainnet as `0x${string}`,
    abi: MORPHO_BLUE_ABI,
    functionName: 'position',
    args: userAddress ? [
      userAddress as `0x${string}`,
      {
        loanToken: marketParams.loanToken as `0x${string}`,
        collateralToken: marketParams.collateralToken as `0x${string}`,
        oracle: marketParams.oracle as `0x${string}`,
        irm: marketParams.irm as `0x${string}`,
        lltv: BigInt(marketParams.lltv)
      }
    ] : undefined,
    query: {
      enabled: !!userAddress,
    },
  })
}

// Generic transaction status hook
export function useTransactionStatus(hash: `0x${string}` | undefined) {
  return useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
  })
}
