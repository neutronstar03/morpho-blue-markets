import { GraphQLClient } from 'graphql-request'
import { MORPHO_GRAPHQL_URL } from './endpoint'
import { fetchWithDeadline } from './request-policy'

export const graphqlClient = new GraphQLClient(MORPHO_GRAPHQL_URL, { fetch: Object.assign(fetchWithDeadline, globalThis.fetch) })
