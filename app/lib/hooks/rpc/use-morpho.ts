import type { SupportedChain } from '~/lib/addresses'
import type { SingleMorphoMarket } from '~/lib/hooks/graphql/use-market'
import { useMemo } from 'react'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useSimulateContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { SIMPLIFIED_MORPHO_BLUE_ABI } from '~/lib/abis/simplified'
import { getSupportedChainName, morphoAddressOnChain } from '~/lib/addresses'
import { useNetworkContext } from '~/lib/contexts/network'

export function getMorphoBlueAddress(chainId?: number): `0x${string}` {
  const chainName = getSupportedChainName(chainId)
  return chainName in morphoAddressOnChain ? morphoAddressOnChain[chainName as SupportedChain] : morphoAddressOnChain.Ethereum
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals)
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!amount)
    return 0n
  // Accept common UX formatting like "11,003.25" or "11 003.25".
  // (viem's parseUnits rejects these, so we sanitize.)
  const normalized = amount.trim().replaceAll(',', '').replaceAll(' ', '').replaceAll('_', '')
  try {
    return parseUnits(normalized, decimals)
  }
  catch {
    // handle invalid amount string e.g. "" or "."
    return 0n
  }
}

export function formatTokenBalance(balance: bigint | undefined, decimals: number): string {
  if (!balance)
    return '0'

  const formatted = formatTokenAmount(balance, decimals)
  const num = Number.parseFloat(formatted)
  // Format for display with commas and a max of 6 decimal places
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function useTokenApproval(tokenAddress: string, amount: string, userAddress: string | undefined, decimals: number) {
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId
  const spender = getMorphoBlueAddress(chainId)
  const isValidAmount = !!amount && Number.parseFloat(amount) > 0

  // USDT (mainnet) is a non-standard ERC20: approve/transfer/transferFrom return no value.
  // Use a no-return ABI for simulate(decode) to avoid "returned no data" errors.
  // IMPORTANT: Must check both address AND chainId (mainnet = 1) to avoid false positives
  const USDT_MAINNET_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7'
  const MAINNET_CHAIN_ID = 1
  const isUsdtMainnet = chainId === MAINNET_CHAIN_ID && tokenAddress?.toLowerCase() === USDT_MAINNET_ADDRESS.toLowerCase()
  const USDT_APPROVE_NO_RETURN_ABI = [
    {
      type: 'function',
      name: 'approve',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [],
    },
  ] as const
  const approveSimAbi = isUsdtMainnet ? USDT_APPROVE_NO_RETURN_ABI : erc20Abi
  const approveWriteAbi = isUsdtMainnet ? USDT_APPROVE_NO_RETURN_ABI : erc20Abi

  const { data: allowance, refetch } = useReadContract({
    chainId,
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: userAddress ? [userAddress as `0x${string}`, spender] : undefined,
    query: {
      enabled: !!userAddress,
    },
  })

  const approveArgs = useMemo(() => {
    if (!isValidAmount)
      return undefined
    return [spender as `0x${string}`, parseTokenAmount(amount, decimals)] as const
  }, [isValidAmount, spender, amount, decimals])

  const {
    data: simulateData,
    error: simulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    chainId,
    address: tokenAddress as `0x${string}`,
    abi: approveSimAbi,
    functionName: 'approve',
    args: approveArgs,
    query: {
      enabled: isValidAmount,
    },
  })

  const { writeContract, writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract()

  const handleApprove = () => {
    if (!simulateData?.request || !approveArgs)
      throw new Error('Approval transaction is not ready yet')
    // For USDT mainnet, explicitly pass the ABI to ensure proper encoding
    // This avoids issues with wagmi's transaction encoding for non-standard ERC20 tokens
    if (isUsdtMainnet) {
      writeContract({
        address: tokenAddress as `0x${string}`,
        abi: approveWriteAbi,
        functionName: 'approve',
        args: approveArgs,
      })
    }
    else {
      writeContract(simulateData.request)
    }
  }

  const handleApproveAsync = async () => {
    if (!simulateData?.request || !approveArgs)
      throw new Error('Approval transaction is not ready yet')
    if (isUsdtMainnet) {
      return writeContractAsync({
        address: tokenAddress as `0x${string}`,
        abi: approveWriteAbi,
        functionName: 'approve',
        args: approveArgs,
      })
    }
    return writeContractAsync(simulateData.request)
  }

  const isAllowanceReady = allowance !== undefined
  const requiredAmount = isValidAmount ? parseTokenAmount(amount, decimals) : 0n

  return {
    allowance: allowance ? formatTokenAmount(allowance, decimals) : '0',
    needsApproval: isValidAmount ? (!isAllowanceReady || requiredAmount > (allowance ?? 0n)) : false,
    isAllowanceReady,
    canApprove: !!simulateData?.request && !!approveArgs,
    approveRequest: simulateData?.request,
    approve: handleApprove,
    approveAsync: handleApproveAsync,
    hash,
    isPending,
    error: simulateError || writeError,
    refetch,
    isSimulating,
  }
}

// Hook for checking token balance in wallet
export function useTokenBalance(tokenAddress: string, userAddress?: string) {
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId
  return useReadContract({
    chainId,
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!userAddress,
      refetchInterval: 5 * 1000, // Refetch every 5 seconds
    },
  })
}

// Hook for supplying to a market
export function useSupply(market: SingleMorphoMarket, amount: string, loanTokenDecimals: number) {
  const { address: userAddress } = useAccount()
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId
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
      parseUnits(amount, loanTokenDecimals),
      BigInt(0), // shares (0 for max)
      userAddress as `0x${string}`, // onBehalf
      '0x', // data
    ] as const
  }, [isValidAmount, market, amount, userAddress, loanTokenDecimals])

  const {
    data: simulateData,
    error: simulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    chainId,
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'supply',
    args: supplyArgs as any,
    query: {
      enabled: isValidAmount && !!userAddress && !!market,
    },
  })

  const { writeContract: supply, writeContractAsync: supplyAsync, data: hash, isPending, error: writeError } = useWriteContract()

  const handleSupply = () => {
    if (!simulateData?.request)
      throw new Error('Deposit transaction is not ready yet')
    supply(simulateData.request)
  }

  const handleSupplyAsync = async () => {
    if (!simulateData?.request)
      throw new Error('Deposit transaction is not ready yet')
    return supplyAsync(simulateData.request)
  }

  return {
    supply: handleSupply,
    supplyAsync: handleSupplyAsync,
    canSupply: !!simulateData?.request,
    supplyRequest: simulateData?.request,
    hash,
    isPending,
    error: simulateError || writeError,
    isSimulating,
  }
}

// Hook for withdrawing from a market
export function useWithdraw(market: SingleMorphoMarket, sharesIn: string) {
  const { address: userAddress } = useAccount()
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId
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

  const {
    data: simulateData,
    error: simulateError,
    isFetching: isSimulating,
  } = useSimulateContract({
    chainId,
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'withdraw',
    args: withdrawArgs as any,
    query: {
      enabled: isValidAmount && !!userAddress && !!market,
    },
  })

  const { writeContract: withdraw, writeContractAsync: withdrawAsync, data: hash, isPending, error: writeError } = useWriteContract()

  const handleWithdraw = () => {
    if (!simulateData?.request)
      throw new Error('Withdrawal transaction is not ready yet')
    withdraw(simulateData.request)
  }

  const handleWithdrawAsync = async () => {
    if (!simulateData?.request)
      throw new Error('Withdrawal transaction is not ready yet')
    return withdrawAsync(simulateData.request)
  }

  return {
    withdraw: handleWithdraw,
    withdrawAsync: handleWithdrawAsync,
    canWithdraw: !!simulateData?.request,
    withdrawRequest: simulateData?.request,
    hash,
    isPending,
    error: simulateError || writeError,
    isSimulating,
  }
}

export function useUserPosition(marketKey: string, userAddress: string | undefined) {
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId

  return useReadContract({
    chainId,
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'position',
    args: [
      marketKey as any,
      userAddress as `0x${string}`,
    ],
    query: {
      enabled: !!userAddress && !!marketKey,
    },
  })
}

export function useMarket(marketKey: string) {
  const activeChainId = useChainId()
  const { requiredChainId } = useNetworkContext()
  const chainId = requiredChainId ?? activeChainId

  return useReadContract({
    chainId,
    address: getMorphoBlueAddress(chainId),
    abi: SIMPLIFIED_MORPHO_BLUE_ABI,
    functionName: 'market',
    args: [marketKey as any],
    query: {
      enabled: !!marketKey,
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
