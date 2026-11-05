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

The expanded supply optimizer now exposes the vault APR hook through an explicit
comparison control. No vault requests are started before activation. Existing popular
asset and token-liquidity caches remain separate paths. Keep #2 open for production
deployment/cache/latency acceptance; do not infer <100ms performance from a mock cache.

## Production UI caller

- [x] Add explicit vault-yield comparison in the expanded supply optimizer; no requests before the comparison is opened.
- [x] Restrict comparison to selected chain and exact selected asset address, retaining existing eligibility exclusions.
- [x] Label average net APY separately from the optimizer APR input; never change inputs or transactions automatically.
- [x] Verify request ownership, asset/chain changes, loading/cache/error/empty states; 156 offline and 50 UI tests pass (2 preexisting skips), typecheck/lint/build pass.
- [x] Verify in Chrome on Carlino: explicit comparison renders cache placeholder then live V1/V2 yields without a connected wallet.
- [ ] Push and check remote CI.

The earlier absence of a production caller is addressed by this opt-in comparison.
Production deployment and Cloudflare cache/latency verification remain outstanding.
