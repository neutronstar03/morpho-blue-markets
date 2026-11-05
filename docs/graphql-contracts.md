# Morpho GraphQL contract verification

Production operations live in app/lib/graphql/queries and are listed explicitly in registry.ts.
Offline tests enforce that inventory and validate all 12 operations against tests/graphql/morpho-schema.json.
The snapshot records its actual UTC fetchedAt and endpoint; it is evidence of that retrieval, not a promise
that the live service will remain available or compatible.

- bun run test:unit: deterministic validation without upstream network dependencies.
- bun run contract:live: introspect the current service with a 15-second deadline, validate operations,
  and distinguish incompatible operations (exit 1) from transport/rate-limit/schema availability (exit 2).
- bun run contract:refresh: update the dated snapshot only after every production operation validates.

A separate scheduled/manual workflow performs the live check. It does not deploy and is separate
from deterministic push/PR checks and the existing version-tag deployment workflow.

The 2026-11-05 refresh caught a real removal of Query.transactions. The replacement verified in the
current schema is marketTransactions with MarketTransactionType.Liquidation; existing filter identities
are unchanged. The query aliases its result to the existing internal transactions key.
A live public-market query returned a validated count of zero. Malformed/unavailable counts are errors,
not zero; the detail UI renders Unavailable when no count is available. No wallet was queried.

Official action.yml files confirmed Node 24 action runtimes for checkout v7.0.1,
setup-node v7.1.0, setup-bun v2.2.0 and wrangler-action v4.1.3.
The shell/test runtime remains the repository-required Node 20, with Bun 1.3.14.
The existing tag workflow retains its triggers/checks; no release or deployment was performed.
