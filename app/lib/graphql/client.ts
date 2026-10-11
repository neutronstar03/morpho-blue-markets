import { GraphQLClient } from 'graphql-request'
import { MORPHO_GRAPHQL_URL } from './endpoint'

export const graphqlClient = new GraphQLClient(MORPHO_GRAPHQL_URL)
