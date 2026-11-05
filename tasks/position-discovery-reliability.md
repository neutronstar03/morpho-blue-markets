# Position discovery reliability (#4)

Goal: discover all direct positions and distinguish unavailable data from an empty wallet.

- [x] Verify current API first/skip/order and PageInfo contracts by live introspection on 2026-11-05.
- [x] Parameterize direct (100) and lean cross-chain (500) pages with explicit SupplyShares/Desc order.
- [x] Complete raw pages before visibility filters, deduplicate by chain/market, reject later-page failure and inconsistent pagination.
- [x] Carry React Query cancellation through discovery and validate identity, quantities and critical numeric fields at the boundary.
- [x] Surface direct/vault discovery and RPC errors; withhold complete totals and plans, label retained data stale and provide retry.
- [x] Do not silently drop failed vault-chain discoveries.
- [x] Test 99/100/101 and 500/501, full/filtered/duplicate pages, cancellation, failures and page-two delivery into live quantities and batch planning.
- [x] Check types/lint/build, 114 prior offline tests plus 1 new flow test, and 39 UI tests (2 existing skips).
- [x] Align deploy:cf target with mbm, without executing a deployment.
- [x] CI/schema maintenance and complete app operation extraction published in 0bffa58; deterministic GitHub CI passed. Workflow scope is resolved.
- [x] Market/optimizer/direct/vault response validation, cancellation and shared deadline/retry policy; see docs/request-boundaries.md.

The live synthetic zero-address query returned a complete empty list; no real wallet
was used. Offset pagination cannot provide a transactional snapshot while balances
change; count changes and inconsistent metadata reject the traversal so it can be
retried. The response is never silently truncated at a later failed page.

Final boundary verification: types/lint/build, 146 offline tests and 44 UI tests pass (2 existing private-wallet skips).
