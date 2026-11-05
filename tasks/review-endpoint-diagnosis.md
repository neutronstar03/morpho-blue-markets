# reviewed-collaterals endpoint diagnosis, 2026-11-05

Observed public behavior (curl, 09:55-09:56 UTC):
- Homepage: HTTP 200. Captured HTML declares v1.6.17 and full SHA 22733916e0e39ec7118fb43a5eeec0d32ee2dfea.
- /api/reviewed-collaterals, with/without chainId: HTTP 502, text/plain, body `error code: 502` (16 bytes), Cloudflare response.
- /api/collateral-review without params: expected HTTP 400 JSON.
- /api/popular-loan-assets?chainId=1: HTTP 200 JSON.

GitHub evidence:
- Last successful known deployment run: https://github.com/neutronstar03/morpho-blue-markets/actions/runs/41316208510 (2026-11-01, 2273391).
- Known deploy workflow triggers only version tags; no tag/release/deployment was performed in this maintenance run.
- The first endpoint 502 was observed before publishing c983ff5, which changes review indexing.

Read-only source/upstream comparison (10:02 UTC):
- Public GitHub tree endpoint and raw decisions manifest both HTTP 200.
- Baseline 2273391 handler executed on Carlino with current GitHub tree: HTTP 200 application/json, 1785-byte tuple list.
- Current handler with current decision manifest: HTTP 200 application/json, [] (no evidence-based decisions have been published yet).
- Application edgeCacheProxy returns JSON error objects, unlike the observed plain Cloudflare error.

Conclusion: the observed failure is localized to the public reviewed-collaterals request path; the whole site is not down. Current data/source changes do not reproduce it, and captured deployment identity predates these commits. Evidence does not support attributing the 502 to the new commits. The precise Cloudflare/runtime cause is not established without deployment/runtime logs.

Access limits: Python probes received Cloudflare HTTP 403 / code 1010 and were stopped without changing user agents, IPs or credentials. Wrangler reports not authenticated; no login, token access, deployment or settings change was attempted. Further production diagnosis needs already-authorized Cloudflare runtime access. No bypass was attempted.
