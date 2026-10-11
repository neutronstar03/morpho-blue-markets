# Direct market URL hydration follow-up

## Goal

Serve the appropriate React Router SPA fallback for direct market URLs on Cloudflare Pages, so opening or refreshing a market page does not trigger a recoverable React hydration mismatch.

## Evidence

- Observed on production v1.6.16: directly opening `/market/0xaa586d26a6fe62d9c0f0948fede6e2130500ac7a655587447e2d4a37e6330589/4663` reports React error 418, then successfully displays the market.
- HTTP reads confirm `/` and that market URL return identical homepage HTML, including the home optimizer markup.
- `react-router.config.ts` combines `ssr: false` with home prerendering; the build emits both `index.html` and `__spa-fallback.html`. No `_redirects` file exists. This deployment/routing configuration is unchanged from v1.6.14; runtime behavior of the old release was not separately reproduced.
- The dataset metadata hydration regression is fixed in v1.6.16. The cached production homepage reload has no new error; the direct-route warning persists independently.

## Checklist and done criteria

- [ ] Confirm the Cloudflare route/fallback precedence, including Pages Functions under `/api/*`.
- [ ] Configure non-prerendered routes to serve the SPA fallback while retaining the homepage prerender.
- [ ] Verify built preview and production behavior for homepage loads, direct market loads, refreshes, and API endpoints.
- [ ] Done: direct market loads hydrate without recovery errors, existing navigation/APIs work, and the change passes repository release verification.
