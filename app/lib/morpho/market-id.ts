import { encodeAbiParameters, keccak256 } from 'viem'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export type MorphoMarketParams = Readonly<{
  loanToken: `0x${string}`
  collateralToken: `0x${string}`
  oracle: `0x${string}`
  irm: `0x${string}`
  lltv: bigint
}>

// Morpho's market id = keccak256(abi.encode(marketParams)).
export function computeMorphoMarketId(params: MorphoMarketParams): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
      ],
      [
        params.loanToken,
        params.collateralToken,
        params.oracle,
        params.irm,
        params.lltv,
      ],
    ),
  ) as `0x${string}`
}
