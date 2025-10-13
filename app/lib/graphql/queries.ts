import { gql } from 'graphql-request'

// Query to get a specific market by uniqueKey
// Note: marketByUniqueKey doesn't seem to work, so we fetch and filter client-side
export const GET_MARKET_BY_ID = gql`
  query GetMarket($uniqueKey: String!) {
    markets(first: 1, where: { uniqueKey: $uniqueKey }) {
      items {
        uniqueKey
        chainId
        lltv
        oracleAddress
        irmAddress
        loanAsset {
          address
          symbol
          name
          decimals
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          supplyAssets
          borrowAssets
          supplyApy
          borrowApy
          utilization
          supplyAssetsUsd
          borrowAssetsUsd
        }
        whitelisted
        creationTimestamp
      }
    }
  }
`

// Query to get all markets with filtering
export const GET_MARKETS = gql`
  query GetMarkets($first: Int!) {
    markets(first: $first) {
      items {
        uniqueKey
        chainId
        lltv
        oracleAddress
        irmAddress
        loanAsset {
          address
          symbol
          name
          decimals
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          supplyAssets
          borrowAssets
          supplyApy
          borrowApy
          utilization
          supplyAssetsUsd
          borrowAssetsUsd
        }
        whitelisted
        creationTimestamp
      }
    }
  }
`

// Query to get markets filtered by chain (simplified - chainId filtering not working yet)
export const GET_MARKETS_BY_CHAIN = gql`
  query GetMarketsByChain($first: Int!) {
    markets(first: $first) {
      items {
        uniqueKey
        chainId
        lltv
        oracleAddress
        irmAddress
        loanAsset {
          address
          symbol
          name
          decimals
        }
        collateralAsset {
          address
          symbol
          name
          decimals
        }
        state {
          supplyAssets
          borrowAssets
          supplyApy
          borrowApy
          utilization
          supplyAssetsUsd
          borrowAssetsUsd
        }
        whitelisted
        creationTimestamp
      }
    }
  }
`
