import { GraphQLClient } from 'graphql-request'

// Official Morpho Blue API endpoint
// This API provides unified access to all chains (mainnet, base, etc.)
export const MORPHO_API_ENDPOINT = 'https://blue-api.morpho.org/graphql'

export const graphqlClient = new GraphQLClient(MORPHO_API_ENDPOINT)

// Chain IDs for filtering
export const CHAIN_IDS = {
  mainnet: 1,
  base: 8453,
} as const

export type Network = keyof typeof CHAIN_IDS

// Helper function to execute a query with error handling
export async function executeQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  try {
    const result = await graphqlClient.request<T>(query, variables)
    return result
  } catch (error: any) {
    console.error('GraphQL query failed:', error)
    if (error.response?.errors) {
      console.error('GraphQL errors:', error.response.errors)
    }
    throw new Error('Failed to fetch data from Morpho Blue API')
  }
}

// Legacy function for backward compatibility
export function getGraphQLClient(): GraphQLClient {
  return graphqlClient
}
