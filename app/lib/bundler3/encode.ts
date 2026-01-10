import type { Hex } from 'viem'
import type { Bundler3Call, MorphoMarketParams } from '~/lib/bundler3/types'
import { encodeFunctionData, keccak256 } from 'viem'
import { BUNDLER3_ABI, GENERAL_ADAPTER1_ABI, PERMIT2_ALLOWANCE_TRANSFER_ABI } from '~/lib/abis/bundler3'

export const ZERO_CALLBACK_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const

export function makeBundler3Call(args: {
  to: `0x${string}`
  data: Hex
  value?: bigint
  skipRevert?: boolean
  callbackHash?: `0x${string}`
}): Bundler3Call {
  return {
    to: args.to,
    data: args.data,
    value: args.value ?? 0n,
    skipRevert: args.skipRevert ?? false,
    callbackHash: args.callbackHash ?? ZERO_CALLBACK_HASH,
  }
}

export function encodeGeneralAdapterMorphoWithdraw(args: {
  adapter: `0x${string}`
  marketParams: MorphoMarketParams
  assets: bigint
  shares?: bigint
  receiver: `0x${string}`
}): Bundler3Call {
  // Use assets- or shares-based withdraw. Set one of (assets, shares) and keep the other at 0.
  // minSharePriceE27=0 to avoid slippage revert.
  const data = encodeFunctionData({
    abi: GENERAL_ADAPTER1_ABI,
    functionName: 'morphoWithdraw',
    args: [args.marketParams, args.assets, args.shares ?? 0n, 0n, args.receiver] as const,
  })
  return makeBundler3Call({ to: args.adapter, data })
}

export function encodeGeneralAdapterMorphoSupply(args: {
  adapter: `0x${string}`
  marketParams: MorphoMarketParams
  assets: bigint
  onBehalf: `0x${string}`
}): Bundler3Call {
  // Use assets-based supply. shares=0. maxSharePriceE27=uint256 max to avoid slippage revert.
  const MAX_U256 = (2n ** 256n) - 1n
  const data = encodeFunctionData({
    abi: GENERAL_ADAPTER1_ABI,
    functionName: 'morphoSupply',
    args: [args.marketParams, args.assets, 0n, MAX_U256, args.onBehalf, '0x'] as const,
  })
  return makeBundler3Call({ to: args.adapter, data })
}

export function encodeGeneralAdapterPermit2TransferFrom(args: {
  adapter: `0x${string}`
  token: `0x${string}`
  receiver: `0x${string}`
  amount: bigint
}): Bundler3Call {
  const data = encodeFunctionData({
    abi: GENERAL_ADAPTER1_ABI,
    functionName: 'permit2TransferFrom',
    args: [args.token, args.receiver, args.amount] as const,
  })
  return makeBundler3Call({ to: args.adapter, data })
}

export function encodePermit2PermitCall(args: {
  permit2: `0x${string}`
  owner: `0x${string}`
  token: `0x${string}`
  spender: `0x${string}`
  amount: bigint
  expiration: number
  nonce: number
  sigDeadline: bigint
  signature: Hex
}): Bundler3Call {
  const data = encodeFunctionData({
    abi: PERMIT2_ALLOWANCE_TRANSFER_ABI,
    functionName: 'permit',
    args: [
      args.owner,
      {
        details: {
          token: args.token,
          amount: args.amount,
          expiration: args.expiration,
          nonce: args.nonce,
        },
        spender: args.spender,
        sigDeadline: args.sigDeadline,
      },
      args.signature,
    ] as const,
  })
  return makeBundler3Call({ to: args.permit2, data })
}

export function encodeBundler3MulticallCalldata(bundle: Bundler3Call[]): Hex {
  // Not strictly required for wagmi, but useful for tests/debugging.
  return encodeFunctionData({
    abi: BUNDLER3_ABI,
    functionName: 'multicall',
    args: [bundle] as const,
  })
}

export function hashBundler3BundleForDebug(bundle: Bundler3Call[]): Hex {
  // Cheap deterministic fingerprint for logs/tests.
  const encoded = encodeBundler3MulticallCalldata(bundle)
  return keccak256(encoded)
}
