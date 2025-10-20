import type { SupportedChain } from '../addresses'
import type { SingleMorphoMarket } from './use-market'
import { useMemo } from 'react'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount, useReadContract, useSimulateContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { useNetworkContext } from '~/lib/contexts/network'
import { getSupportedChainName, morphoAddressOnChain } from '../addresses'
import { tokenAmountToWei } from '../tokens'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from './simplified.abi'

export function getMorphoBlueAddress(chainId?: number): `0x${string}` {
  const chainName = getSupportedChainName(chainId)
  return chainName in morphoAddressOnChain ? morphoAddressOnChain[chainName as SupportedChain] : morphoAddressOnChain.Ethereum
}

export const TOKEN_DECIMALS: Record<string, number> = {
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 6, // USDC on Ethereum
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC on Base
}

function getTokenDecimals(tokenAddress: string): number {
  return TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18
}

export function formatTokenAmount(amount: bigint, tokenAddress: string): string {
  const decimals = getTokenDecimals(tokenAddress)
  return formatUnits(amount, decimals)
}

export function parseTokenAmount(amount: string, tokenAddress: string): bigint {
  if (!amount)
    return 0n
  const decimals = getTokenDecimals(tokenAddress)
  try {
    return parseUnits(amount, decimals)
  }
  catch {
    // handle invalid amount string e.g. "" or "."
    return 0n
  }
}

export function formatTokenBalance(balance: bigint | undefined, tokenAddress: string): string {
  if (!balance)
    return '0'

  const formatted = formatTokenAmount(balance, tokenAddress)
  const num = Number.parseFloat(formatted)
  // Format for display with commas and a max of 6 decimal places
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function useTokenApproval(tokenAddress: string, amount: string, userAddress?: string) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId
  const spender = getMorphoBlueAddress(chainId)
  const isValidAmount = !!amount && Number.parseFloat(amount) > 0

  const { data: allowance, refetch } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: userAddress ? [userAddress as `0x${string}`, spender] : undefined,
    query: {
      enabled: !!userAddress && !isWrongNetwork,
    },
  })

  const approveArgs = useMemo(() => {
    if (!isValidAmount)
      return undefined
    return [spender as `0x${string}`, parseTokenAmount(amount, tokenAddress)] as const
  }, [isValidAmount, spender, amount, tokenAddress])

  const { data: simulateData, error: simulateError } = useSimulateContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'approve',
    args: approveArgs,
    query: {
      enabled: isValidAmount && !isWrongNetwork,
    },
  })

  const { writeContract: approve, data: hash, isPending, error: writeError } = useWriteContract()

  const handleApprove = () => {
    if (simulateData?.request) {
      approve(simulateData.request)
    }
  }

  return {
    allowance: allowance ? formatTokenAmount(allowance, tokenAddress) : '0',
    needsApproval: isValidAmount && allowance !== undefined ? parseTokenAmount(amount, tokenAddress) > allowance : false,
    approve: handleApprove,
    hash,
    isPending,
    error: simulateError || writeError,
    refetch,
  }
}

// Hook for checking token balance in wallet
export function useTokenBalance(tokenAddress: string, userAddress?: string) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId
  return useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!userAddress && !isWrongNetwork,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  })
}

// Hook for supplying to a market
export function useSupply(market: SingleMorphoMarket, amount: string, loanTokenDecimals: number) {
  const { chainId, address: userAddress } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId
  const isValidAmount = !!amount && Number.parseFloat(amount) > 0

  const supplyArgs = useMemo(() => {
    if (!isValidAmount || !userAddress)
      return undefined
    return [
      {
        loanToken: market.loanAsset.address as `0x${string}`,
        collateralToken: market.collateralAsset?.address as `0x${string}`,
        oracle: market.oracleAddress as `0x${string}`,
        irm: market.irmAddress as `0x${string}`,
        lltv: BigInt(market.lltv),
      },
      tokenAmountToWei(amount, loanTokenDecimals),
      BigInt(0), // shares (0 for max)
      userAddress as `0x${string}`, // onBehalf
      '0x', // data
    ] as const
  }, [isValidAmount, market, amount, userAddress])

  const { data: simulateData, error: simulateError } = useSimulateContract({
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'supply',
    args: supplyArgs as any,
    query: {
      enabled: isValidAmount && !!userAddress && !!market && !isWrongNetwork,
    },
  })

  const { writeContract: supply, data: hash, isPending, error: writeError } = useWriteContract()

  const handleSupply = () => {
    if (simulateData?.request) {
      supply(simulateData.request)
    }
  }

  return {
    supply: handleSupply,
    hash,
    isPending,
    error: simulateError || writeError,
  }
}

// Hook for withdrawing from a market
export function useWithdraw(market: SingleMorphoMarket, sharesIn: string) {
  const { chainId, address: userAddress } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId
  const isValidAmount = !!sharesIn && Number.parseFloat(sharesIn) > 0

  const withdrawArgs = useMemo(() => {
    if (!isValidAmount || !userAddress)
      return undefined
    return [
      {
        loanToken: market.loanAsset.address as `0x${string}`,
        collateralToken: market.collateralAsset?.address as `0x${string}`,
        oracle: market.oracleAddress as `0x${string}`,
        irm: market.irmAddress as `0x${string}`,
        lltv: BigInt(market.lltv),
      },
      0n, // assets
      parseUnits(sharesIn, 18), // shares
      userAddress as `0x${string}`, // onBehalf
      userAddress as `0x${string}`, // receiver (user's address)
    ] as const
  }, [isValidAmount, market, sharesIn, userAddress])

  const { data: simulateData, error: simulateError } = useSimulateContract({
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'withdraw',
    args: withdrawArgs as any,
    query: {
      enabled: isValidAmount && !!userAddress && !!market && !isWrongNetwork,
    },
  })

  const { writeContract: withdraw, data: hash, isPending, error: writeError } = useWriteContract()

  const handleWithdraw = () => {
    if (simulateData?.request) {
      withdraw(simulateData.request)
    }
  }

  return {
    withdraw: handleWithdraw,
    hash,
    isPending,
    error: simulateError || writeError,
  }
}

export function useUserPosition(marketKey: string, userAddress: string | undefined) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  return useReadContract({
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'position',
    args: [
      marketKey as any,
      userAddress as `0x${string}`,
    ],
    query: {
      enabled: !!userAddress && !!marketKey && !isWrongNetwork,
    },
  })
}

export function useMarket(marketKey: string) {
  const { chainId } = useAccount()
  const { requiredChainId } = useNetworkContext()
  const isWrongNetwork = requiredChainId && chainId !== requiredChainId

  return useReadContract({
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'market',
    args: [marketKey as any],
    query: {
      enabled: !!marketKey && !isWrongNetwork,
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
