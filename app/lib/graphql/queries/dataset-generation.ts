export const QUERY_DATASET_MARKETS = `
    query EnumerateMarkets($first: Int!, $skip: Int!) {
      markets(first: $first, skip: $skip) {
        items {
          uniqueKey: marketId
          morphoBlue { chain { id } }
          collateralAsset { symbol address }
          loanAsset { symbol address }
          warnings { type level }
        }
      }
    }
  `

export const QUERY_DATASET_UNHEALTHY_POSITIONS = `
    query EnumerateUnhealthyPositions($first: Int!, $skip: Int!) {
      marketPositions(
        first: $first
        skip: $skip
        orderBy: HealthFactor
        orderDirection: Asc
        where: { healthFactor_lte: 1, borrowShares_gte: "1", marketListed: true }
      ) {
        items {
          healthFactor
          market {
            marketId
            morphoBlue { chain { id } }
            collateralAsset { symbol address }
            loanAsset { symbol address }
          }
          state {
            collateralUsd
            borrowAssetsUsd
          }
        }
      }
    }
  `

// Discovery queues research only. Display metadata and prices are not approval evidence.
export const QUERY_COLLATERAL_CANDIDATES = `
  query CollateralResearchCandidates($where: MarketFilters!, $first: Int!, $skip: Int!) {
    markets(where: $where, first: $first, skip: $skip, orderBy: NetSupplyApy, orderDirection: Desc) {
      items { morphoBlue { chain { id } } collateralAsset { address } }
    }
  }
`
