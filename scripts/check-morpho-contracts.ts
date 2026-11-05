import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { buildClientSchema, getIntrospectionQuery, parse, validate } from 'graphql'
import { MORPHO_GRAPHQL_URL } from '../app/lib/graphql/endpoint'
import { PRODUCTION_OPERATIONS } from '../app/lib/graphql/queries/registry'

const refresh = process.argv.includes('--refresh')
try {
  const response = await fetch(MORPHO_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}; retry-after=${response.headers.get('retry-after') ?? 'none'}`)
  const raw = await response.json() as { data?: unknown, errors?: unknown }
  if (raw.errors || !raw.data)
    throw new Error('Live introspection is unavailable or malformed')
  // buildClientSchema is the GraphQL library boundary validator for introspection.
  const schema = buildClientSchema(raw.data as Parameters<typeof buildClientSchema>[0])
  const failures = Object.entries(PRODUCTION_OPERATIONS).flatMap(([name, document]) => {
    const errors = validate(schema, parse(document))
    return errors.map(error => `${name}: ${error.message}`)
  })
  if (failures.length) {
    console.error(`INCOMPATIBLE_OPERATIONS\n${failures.join('\n')}`)
    process.exitCode = 1
  }
  else {
    console.log(`COMPATIBLE: ${Object.keys(PRODUCTION_OPERATIONS).length} production operations`)
    if (refresh) {
      await writeFile(new URL('../tests/graphql/morpho-schema.json', import.meta.url), `${JSON.stringify({ fetchedAt: new Date().toISOString(), endpoint: MORPHO_GRAPHQL_URL, schema: raw.data })}\n`)
      console.log('Saved schema snapshot with current UTC provenance')
    }
  }
}
catch (error) {
  console.error('LIVE_TRANSPORT_OR_SCHEMA_UNAVAILABLE:', error instanceof Error ? error.message : String(error))
  process.exitCode = 2
}
