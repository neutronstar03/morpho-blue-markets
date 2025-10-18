import { GraphQLClient } from 'graphql-request'

const MORPHO_API_URL = 'https://api.morpho.org/graphql'

export const graphqlClient = new GraphQLClient(MORPHO_API_URL)
