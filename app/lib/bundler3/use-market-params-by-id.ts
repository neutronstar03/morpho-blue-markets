import type { Address } from 'viem'
import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { MORPHO_AUTH_ABI } from '~/lib/abis/bundler3'

// Batch-reads Morpho market params by id and normalizes wagmi's return shapes into a lowercase-id lookup map for bundle builders.

export interface MarketParamsByIdResult {
  marketParamsRead: ReturnType<typeof useReadContracts>
  marketParamsById: Map<string, {
    loanToken: Address
    collateralToken: Address
    oracle: Address
    irm: Address
    lltv: bigint
  }>
}

export function useMarketParamsById(
  enabled: boolean,
  morphoAddress: Address | undefined,
  marketIds: readonly `0x${string}`[],
): MarketParamsByIdResult {
  const marketParamsContracts = useMemo(() => {
    if (!enabled || !morphoAddress || marketIds.length === 0)
      return []
    return marketIds.map(id => ({
      address: morphoAddress,
      abi: MORPHO_AUTH_ABI,
      functionName: 'idToMarketParams' as const,
      args: [id] as const,
    }))
  }, [enabled, marketIds, morphoAddress])

  const marketParamsRead = useReadContracts({
    contracts: marketParamsContracts as any,
    allowFailure: true,
    query: { enabled: enabled && !!morphoAddress && marketParamsContracts.length > 0 },
  })

  const marketParamsById = useMemo(() => {
    const map = new Map<string, {
      loanToken: Address
      collateralToken: Address
      oracle: Address
      irm: Address
      lltv: bigint
    }>()
    const reads = marketParamsRead.data
    if (!reads || reads.length !== marketParamsContracts.length)
      return map
    for (let i = 0; i < marketParamsContracts.length; i++) {
      const id = marketIds[i]
      const res = reads[i]
      if (res?.status !== 'success' || !res.result)
        continue
      const raw: any = res.result
      // Some wagmi/ABI paths surface tuples as arrays while others expose named fields, so handle both before handing params to encoders.
      const params = Array.isArray(raw)
        ? {
            loanToken: raw[0] as Address,
            collateralToken: raw[1] as Address,
            oracle: raw[2] as Address,
            irm: raw[3] as Address,
            lltv: BigInt(raw[4]),
          }
        : {
            loanToken: raw.loanToken as Address,
            collateralToken: raw.collateralToken as Address,
            oracle: raw.oracle as Address,
            irm: raw.irm as Address,
            lltv: BigInt(raw.lltv),
          }
      map.set(id.toLowerCase(), params)
    }
    return map
  }, [marketIds, marketParamsContracts.length, marketParamsRead.data])

  return {
    marketParamsRead,
    marketParamsById,
  }
}
