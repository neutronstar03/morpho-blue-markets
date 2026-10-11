// Shared popular loan-assets query and normalized contract for the
// "interesting markets" aggregation.
//
// The browser hook and the Cloudflare Pages Function import the same query
// string so the edge cache and the direct GraphQL path never drift. This
// module has no React, graphql-request, wagmi, or market-blacklist imports.

export const QUERY_POPULAR_LOAN_ASSETS = `
  query InterestingMarkets(
    $first: Int = 100
    $skip: Int = 0
    $chainId: Int = 1
    $minNetSupplyApy: Float = 0.05
    $maxNetSupplyApy: Float = 10
    $minBorrowUsd: Float = 10000
    $minUtilization: Float = 0.1
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: NetSupplyApy
      orderDirection: Desc
      where: {
        chainId_in: [$chainId]
        netSupplyApy_gte: $minNetSupplyApy
        netSupplyApy_lte: $maxNetSupplyApy
        borrowAssetsUsd_gte: $minBorrowUsd
        utilization_gte: $minUtilization
      }
    ) {
      items {
        marketId
        uniqueKey: marketId
        loanAsset {
          address
          symbol
          name
          decimals
          chain { id network }
          price { usd }
        }
        state {
          utilization
          borrowAssetsUsd
          netSupplyApy
        }
      }
    }
  }
`

// Trusted, normalized item contract. Required base fields stay required; `null`
// is only used for real product states (a loan asset without an oracle price,
// or the nullable borrow/APY metrics the API returns for filtered markets).
export interface PopularLoanAssetsMarketItem {
  marketId: string
  uniqueKey: string
  loanAsset: {
    address: string
    symbol: string
    name: string
    decimals: number
    chain: { id: number, network: string }
    price: { usd: number } | null
  }
  state: {
    utilization: number
    borrowAssetsUsd: number | null
    netSupplyApy: number | null
  }
}

export interface PopularLoanAssetsQueryResult {
  markets: {
    items: PopularLoanAssetsMarketItem[]
  }
}

// Normalized wire envelope returned by GET /api/popular-loan-assets, matching
// the shape the GraphQL body uses so the edge and direct paths stay identical.
export interface PopularLoanAssetsEnvelope {
  data: PopularLoanAssetsQueryResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function parseMarketItem(value: unknown): PopularLoanAssetsMarketItem | null {
  if (!isRecord(value))
    return null

  const { marketId, uniqueKey, loanAsset, state } = value
  if (typeof marketId !== 'string' || typeof uniqueKey !== 'string')
    return null
  if (!isRecord(loanAsset) || !isRecord(state))
    return null

  const chain = loanAsset.chain
  if (!isRecord(chain))
    return null
  if (typeof loanAsset.address !== 'string' || typeof loanAsset.symbol !== 'string' || typeof loanAsset.name !== 'string')
    return null
  if (!isFiniteNumber(loanAsset.decimals) || !Number.isInteger(loanAsset.decimals) || loanAsset.decimals < 0 || loanAsset.decimals > 255)
    return null
  if (!isFiniteNumber(chain.id) || !Number.isSafeInteger(chain.id) || chain.id <= 0 || typeof chain.network !== 'string')
    return null

  const rawPrice = loanAsset.price
  let price: { usd: number } | null = null
  if (rawPrice !== null) {
    if (!isRecord(rawPrice) || !isFiniteNumber(rawPrice.usd))
      return null
    price = { usd: rawPrice.usd }
  }

  if (!isFiniteNumber(state.utilization))
    return null
  if (!isFiniteNumberOrNull(state.borrowAssetsUsd) || !isFiniteNumberOrNull(state.netSupplyApy))
    return null

  return {
    marketId,
    uniqueKey,
    loanAsset: {
      address: loanAsset.address,
      symbol: loanAsset.symbol,
      name: loanAsset.name,
      decimals: loanAsset.decimals,
      chain: { id: chain.id, network: chain.network },
      price,
    },
    state: {
      utilization: state.utilization,
      borrowAssetsUsd: state.borrowAssetsUsd,
      netSupplyApy: state.netSupplyApy,
    },
  }
}

// Validate an untrusted upstream GraphQL payload at the boundary and return the
// normalized `{ data: { markets: { items } } }` envelope. Throws on any
// malformed shape or GraphQL error so the edge handler responds 502 without
// caching the body.
export function parsePopularLoanAssetsEnvelope(payload: unknown): PopularLoanAssetsEnvelope {
  if (!isRecord(payload))
    throw new Error('Malformed upstream payload: expected an object')

  if (payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length > 0))
    throw new Error('Upstream GraphQL errors')

  const data = payload.data
  if (!isRecord(data))
    throw new Error('Malformed upstream payload: missing data')

  const markets = data.markets
  if (!isRecord(markets) || !Array.isArray(markets.items))
    throw new Error('Malformed upstream payload: missing markets.items')

  const items = markets.items.map(parseMarketItem)
  if (items.includes(null))
    throw new Error('Malformed upstream payload: invalid market item')

  return { data: { markets: { items: items as PopularLoanAssetsMarketItem[] } } }
}
