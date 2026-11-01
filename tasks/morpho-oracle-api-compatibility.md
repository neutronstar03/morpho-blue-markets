# Morpho oracle API compatibility patch

Goal: Restore MBM market list, detail, and optimizer discovery against the current Morpho GraphQL schema without changing financial calculations or transaction behavior.

- [x] Resolve MBM and publish code-grounded assessment issue (#4).
- [x] Reproduce the removed Market.oracleAddress validation error against the live API.
- [x] Migrate affected selections and normalize oracle metadata safely.
- [x] Add regression coverage; run type, lint, unit, UI, build, and targeted live checks.
- [x] Update release documentation and version to the next patch.
- [ ] Publish commit and matching release tag; verify exact-commit deployment succeeds.

Done: regression checks pass and the patch release's Cloudflare deployment succeeds. Broader assessment improvements remain in issue #4.

Verification: 95 offline tests passed; 29 UI tests passed (2 optional private-wallet tests skipped); typecheck, lint, build, and exact live list/optimizer/detail query probes passed. Removed upstream fields were Market.oracleAddress and Asset.priceUsd.
