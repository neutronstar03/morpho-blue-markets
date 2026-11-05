import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { buildClientSchema, parse, validate } from 'graphql'
import { PRODUCTION_OPERATIONS } from '../../app/lib/graphql/queries/registry'

const root = new URL('../../', import.meta.url)
const snapshot = JSON.parse(readFileSync(new URL('./morpho-schema.json', import.meta.url), 'utf8')) as { fetchedAt: string, schema: Parameters<typeof buildClientSchema>[0] }
const schema = buildClientSchema(snapshot.schema)

describe('production GraphQL contracts (offline snapshot)', () => {
  test('records dated schema provenance', () => {
    expect(Number.isFinite(Date.parse(snapshot.fetchedAt))).toBe(true)
  })
  for (const [name, document] of Object.entries(PRODUCTION_OPERATIONS)) {
    test(name, () => {
      expect(validate(schema, parse(document)).map(error => error.message)).toEqual([])
    })
  }
  test('removed upstream fields fail validation in the current snapshot', () => {
    const invalid = 'query { markets(first: 1) { items { oracleAddress loanAsset { priceUsd } } } }'
    expect(validate(schema, parse(invalid)).length).toBeGreaterThan(0)
  })
  test('operations live in non-React query modules and are explicitly registered', async () => {
    for (const glob of ['app/**/*.ts', 'app/**/*.tsx', 'functions/**/*.ts']) {
      for (const path of new Bun.Glob(glob).scanSync({ cwd: root.pathname, onlyFiles: true })) {
        const source = readFileSync(new URL(path, root), 'utf8')
        if (!path.startsWith('app/lib/graphql/queries/')) {
          expect(source.match(/(?:gql)?`\s*(?:query|mutation|subscription)\b/)).toBeNull()
          continue
        }
        const exports = [...source.matchAll(/export const (\w+) = (?:gql)?`\s*(?:query|mutation|subscription)\b/g)].map(match => match[1])
        if (!exports.length)
          continue
        const module = await import(new URL(path, root).href)
        for (const name of exports)
          expect((PRODUCTION_OPERATIONS as Record<string, string>)[name]).toBe(module[name])
      }
    }
  })
})
