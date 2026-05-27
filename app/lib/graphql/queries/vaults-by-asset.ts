import { gql } from 'graphql-request'

export interface SupplyVaultV1Data {
  address: string
  name: string
  symbol: string
  whitelisted: boolean
  chain: {
    id: number
  }
  asset: {
    address: string
    symbol: string
    decimals: number
  }
  state?: {
    avgNetApy?: number | null
    totalAssetsUsd?: number | null
  } | null
  liquidity?: {
    usd?: number | null
  } | null
}

export interface SupplyVaultV2Data {
  address: string
  name: string
  symbol: string
  whitelisted: boolean
  chain: {
    id: number
  }
  asset: {
    address: string
    symbol: string
    decimals: number
  }
  avgNetApy?: number | null
  totalAssetsUsd?: number | null
  liquidityUsd?: number | null
}

export enum VaultOrderBy {
  AvgNetApy = 'AvgNetApy',
}

export enum VaultV2OrderBy {
  Address = 'Address',
}

export enum OrderDirection {
  Desc = 'Desc',
}

export interface QueryVaultsV1Result {
  vaults: {
    items: SupplyVaultV1Data[]
  }
}

export interface QueryVaultsV2Result {
  vaultV2s: {
    items: SupplyVaultV2Data[]
  }
}

export const QUERY_VAULTS_V1 = gql`
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
        whitelisted: listed
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

export const QUERY_VAULTS_V2 = gql`
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
        whitelisted: listed
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
