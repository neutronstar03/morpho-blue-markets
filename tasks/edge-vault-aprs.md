# Vault APR edge cache (#2)

Goal: complete the missing public vault endpoint and opt-in query hook without
introducing requests on pages that do not consume vault APRs.

- [x] Shared V1/V2 queries and validated, complete pagination; intentional null metrics retained.
- [x] GET /api/vault-aprs, all supported chains, 120 second Cache API TTL; upstream failures not cached.
- [x] Wire the function into Vite development routing.
- [x] Opt-in useMarketAprByVaults hook: edge placeholder and independent cancellable live query; config applied to both sources.
- [x] Verify cache hit/miss/failure, pagination, typecheck, lint, build and UI suites: 156 offline and 47 UI pass (2 existing skips).
- [x] Verify local route through Chrome on Carlino: normalized V1/V2 JSON rendered from http://100.101.230.93:5198/api/vault-aprs on 2026-11-05.
- [ ] Production deployment/latency verification: outside current release authorization.

The current application has no production caller of the existing vault-APR helper.
This change supplies the endpoint/hook for callers; it does not add artificial home
preloads or claim an unmounted feature is visible in production. Existing popular
asset and token-liquidity caches are separate paths. Keep #2 open for its outstanding
production acceptance criteria; do not infer <100ms performance from a mock cache.
