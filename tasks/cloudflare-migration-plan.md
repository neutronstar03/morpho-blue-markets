# Cloudflare Workers Migration + Umami Analytics Proxy Plan

**Branch:** `feat/custom-domain`
**Goal:** Migrate from GitHub Pages to Cloudflare Pages (Workers) with a first-party analytics proxy that evades adblockers.

## Why
- GitHub Pages has no server-side capability — no place to proxy analytics.
- Cloudflare Workers/Pages gives us an edge-side proxy (`functions/`) that forwards `/__ev` to Umami, making analytics invisible to uBlock Origin et al.
- Custom domain at root `/` (no subpath).

## Architecture

```
Browser (SPA)                    Cloudflare Pages/Workers              Self-hosted Umami
    |                                    |                                    |
    |-- GET /* (static assets) --------->|                                    |
    |<-- index.html, JS, CSS ------------|                                    |
    |                                    |                                    |
    |-- POST /__ev (pageview/event) ---->|                                    |
    |                                    |-- POST /api/send ----------------->|
    |                                    |<-- 200 OK ------------------------|
    |<-- 200 OK -------------------------|                                    |
```

The Umami backend URL never appears in client-side code.
Adblockers only see same-origin requests to `/__ev`.

## Key Decisions
- **SSR: false** — DeFi apps are client-first (wallets, RPC, React Query). SSR adds complexity and latency for zero benefit here.
- **SPA mode** — All meaningful data loads happen client-side.
- **Analytics proxy via Cloudflare Pages Functions** (`functions/` directory convention) — no separate Worker deployment needed.
- **Custom Umami client** (not npm `umami-tracker`) — 60 lines, zero identifiable Umami strings in the bundle, full control over payload format.

---

## Checklist

- [x] 1. Add Cloudflare Pages dependencies (`wrangler`, `@cloudflare/workers-types`)
- [x] 2. Create `wrangler.toml` config
- [x] 3. Remove `/morpho-blue-markets/` base path from `vite.config.ts` and `react-router.config.ts`
- [x] 4. Create `functions/__ev.ts` — Umami analytics proxy endpoint (with `functions/env.d.ts` for types)
- [x] 5. Create `app/lib/analytics.ts` — bundled Umami tracker init (first-party endpoint)
- [x] 6. Initialize analytics in `app/root.tsx` via `useEffect` with `useLocation`
- [x] 7. Add CF Pages deploy scripts to `package.json` (`preview:cf`, `deploy:cf`)
- [x] 8. Replace GitHub Pages deploy workflow with Cloudflare Pages deploy
- [x] 9. Add note to Dockerfile (Cloudflare Pages is the production deploy target)
- [x] 10. Verify: `bun run typecheck`, `bun run lint`, `bun run build` — all pass

## Done Criteria
- [x] `bun run build` produces a working SPA in `build/client/` with no base subpath.
- [x] `functions/__ev.ts` exists and forwards POST requests to a configurable Umami backend.
- [x] `app/lib/analytics.ts` is imported in `root.tsx` and sends events to `/__ev`.
- [x] No external analytics script tags in the HTML — everything is bundled.
- [x] The GitHub Pages workflow is replaced with a Cloudflare Pages deploy.
- [x] Typecheck, lint, and build all pass.

## Remaining (done in separate sessions)
- Set up Cloudflare Pages project in the dashboard, connect GitHub repo
- Point custom domain to the Cloudflare Pages project
- Deploy self-hosted Umami instance (separate server/VPS)
- Set `UMAMI_BACKEND_URL` secret: `wrangler pages secret put UMAMI_BACKEND_URL`
- Set `VITE_UMAMI_WEBSITE_ID` env var in Cloudflare dashboard
- Test end-to-end: visit site → check browser network tab for `POST /__ev` → verify event appears in Umami dashboard