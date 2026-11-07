# Edge cache resilience and filter parity (MBM #2)

## Goal
Keep the optional cache from blocking valid upstream data, and preserve the
same explicit market filters on the edge and direct GraphQL paths.

## Checklist
- [x] Reproduce cache read/write outages, replaced zero filters, malformed input,
  and the lost Pages execution context with regression tests.
- [x] Fall back to upstream on cache read errors; contain background cache writes.
- [x] Preserve explicit zero values, reject invalid filters before cache/upstream
  access, and reject malformed token addresses before building upstream URLs.
- [x] Bind Pages waitUntil calls to their execution context in all affected handlers.
- [x] Node 20.20.2 / Bun 1.3.14: lint, typecheck, 165 offline tests, 50 UI
  tests (2 existing skips), and production build pass.
- [x] Inspect versioned CI and local hooks before publication. Main runs
  deterministic checks; software deployment remains tag-only.

Verify the published main commit and its deterministic CI in the run report.
GitHub remote hooks cannot be inspected by the collaborator account (404;
admin:repo_hook scope absent); no permissions were expanded.

Production deployment and real edge/browser latency checks remain outside this
run. The existing tag-only software deployment workflow is unchanged.
