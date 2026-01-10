import type { Address, Hex, TypedDataDomain } from 'viem'

export const PERMIT2_EIP712_NAME = 'Permit2' as const

export interface Permit2PermitSingle {
  details: {
    token: Address
    amount: bigint
    expiration: bigint
    nonce: bigint
  }
  spender: Address
  sigDeadline: bigint
}

// EIP-712 types for Permit2 AllowanceTransfer "PermitSingle".
export const PERMIT2_TYPES = {
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
} as const

export function buildPermit2Domain(args: {
  chainId: number
  permit2: Address
}): TypedDataDomain {
  return {
    name: PERMIT2_EIP712_NAME,
    chainId: args.chainId,
    verifyingContract: args.permit2,
  }
}

export function buildPermit2PermitSingleTypedData(args: {
  chainId: number
  permit2: Address
  owner: Address
  permitSingle: Permit2PermitSingle
}): {
  domain: TypedDataDomain
  types: typeof PERMIT2_TYPES
  primaryType: 'PermitSingle'
  message: Permit2PermitSingle
} {
  return {
    domain: buildPermit2Domain({ chainId: args.chainId, permit2: args.permit2 }),
    types: PERMIT2_TYPES,
    primaryType: 'PermitSingle',
    message: args.permitSingle,
  }
}

export function toUint160Clamp(x: bigint): bigint {
  const MAX = (2n ** 160n) - 1n
  if (x < 0n)
    return 0n
  return x > MAX ? MAX : x
}

export function toUint48Clamp(x: bigint): bigint {
  const MAX = (2n ** 48n) - 1n
  if (x < 0n)
    return 0n
  return x > MAX ? MAX : x
}

export function asHexSignature(sig: string): Hex {
  return sig as Hex
}
