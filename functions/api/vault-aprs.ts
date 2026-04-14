// Edge-cached API endpoint: GET /api/vault-aprs
// Caches Morpho GraphQL vault data (V1 + V2) at the Cloudflare edge (120s TTL).
// Returns combined raw GraphQL response JSON for use as placeholderData.

import { edgeCacheProxy } from '../api/_cache-utils'

// GraphQL query strings matching the frontend's QUERY_VAULTS_V1 and QUERY_VAULTS_V2
// (from vaults-by-asset.ts).
// Keep in sync with the frontend queries — they change rarely but must match exactly.
const QUERY_VAULTS_V1 = `
  query GetVaultsV1(
    $first: Int!
    $skip: Int!
    $where: VaultFilters
    $orderBy: VaultOrderBy
    $orderDirection: OrderDirection
  ) {
    vaults(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      items {
        address
        name
        symbol
        whitelisted
        chain { id }
        asset {
          address
          symbol
          decimals
        }
        state {
          avgNetApy
          totalAssetsUsd
        }
        liquidity {
          usd
        }
      }
    }
  }
`

const QUERY_VAULTS_V2 = `
  query GetVaultsV2(
    $first: Int!
    $skip: Int!
    $where: VaultV2sFilters
    $orderBy: VaultV2OrderBy
    $orderDirection: OrderDirection
  ) {
    vaultV2s(
      first: $first
      skip: $skip
      where: $where
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      items {
        address
        name
        symbol
        whitelisted
        chain { id }
        asset {
          address
          symbol
          decimals
        }
        avgNetApy
        totalAssetsUsd
        liquidityUsd
      }
    }
  }
`

const MORPHO_GRAPHQL_URL = 'https://api.morpho.org/graphql'
const CACHE_TTL_SECONDS = 120

interface Env {}

export async function onRequestGet(context: EventContext<Env>): Promise<Response> {
  const url = new URL(context.request.url)

  // Parse optional filter params with defaults matching the frontend hook
  const minLiquidityUsd = Number(url.searchParams.get('minLiquidityUsd')) || 50_000

  // All supported chains (must match supportedChainMap in the frontend)
  const chainIds = [1, 8453, 42161, 137, 130, 999, 747474, 10, 143, 988]

  const whereV1 = {
    chainId_in: chainIds,
    totalAssetsUsd_gte: minLiquidityUsd,
    whitelisted: true,
  }
  const whereV2 = {
    chainId_in: chainIds,
    totalAssetsUsd_gte: minLiquidityUsd,
    whitelisted: true,
  }

  return edgeCacheProxy({
    requestUrl: url.toString(),
    waitUntil: context.waitUntil,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    fetchUpstream: async () => {
      // Fetch V1 and V2 in parallel
      const [v1Result, v2Result] = await Promise.all([
        fetch(MORPHO_GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: QUERY_VAULTS_V1,
            variables: {
              first: 200,
              skip: 0,
              where: whereV1,
              orderBy: 'AvgNetApy',
              orderDirection: 'Desc',
            },
          }),
        }),
        fetch(MORPHO_GRAPHQL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: QUERY_VAULTS_V2,
            variables: {
              first: 200,
              skip: 0,
              where: whereV2,
              orderBy: 'Address',
              orderDirection: 'Desc',
            },
          }),
        }),
      ])

      if (!v1Result.ok || !v2Result.ok) {
        throw new Error(`Upstream error: V1=${v1Result.status}, V2=${v2Result.status}`)
      }

      const [v1Data, v2Data] = await Promise.all([v1Result.json(), v2Result.json()])

      return { data: { v1: v1Data, v2: v2Data } }
    },
  })
}
