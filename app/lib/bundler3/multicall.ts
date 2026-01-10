import type { Address } from 'viem'
import type { Bundler3Call } from '~/lib/bundler3/types'
import { BUNDLER3_ABI } from '~/lib/abis/bundler3'

export function makeBundler3MulticallRequest(args: {
  bundler3: Address
  bundle: Bundler3Call[]
}) {
  const value = args.bundle.reduce((sum, c) => sum + (c.value ?? 0n), 0n)
  return {
    address: args.bundler3,
    abi: BUNDLER3_ABI,
    functionName: 'multicall' as const,
    args: [args.bundle] as const,
    value,
  }
}
