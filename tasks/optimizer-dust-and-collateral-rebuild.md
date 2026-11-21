# Optimizer dust and collateral review rollout

Goal: remove misleading automatic optimizer alerts and make every shared
collateral approval traceable to a current, explicit review.

- [x] Reproduce the WETH alert from a dust position or incomplete USD pricing.
  Gate background optimization at $1 of fully valued principal per loan asset
  across eligible positions. Leave manual optimization and balance visibility
  available. Show absolute APR gains in percentage points.
- [x] Verify Ethereum stUSDS by exact chain and address. Prepare its canonical
  blacklist decision in the reviews repository. The dataset publisher derives
  market exclusions from the decision manifest. Withdrawal access remains
  available subject to liquidity.
- [ ] Release the MBM consumer after the checks below. Verify the deployed
  SHA and positive-only reviewed-collaterals endpoint. Then publish the stUSDS
  review on the reviews default branch and observe the artifact refresh.
  The legacy consumer treats a new review path as positive coverage, so
  publishing a negative review first would create an incorrect signal.
- [ ] Inventory the published whitelist, descriptive review paths, decisions
  and stronger exclusions by chain and address. Export a diff with provenance
  and prioritize exposed balances, exit liquidity, oracle construction and
  liquidation headroom. Keep legacy-only records as pending research once
  their approval path is retired. Start with sUSDat and the open review queue.
- [ ] Replace legacy approval fallback with a single validated decision
  snapshot. Require generation time and matching source revisions, cap
  positive snapshot age, and keep known exclusions effective on outages.
  Review local overrides separately. Keep oracle reviews separate from asset
  verdicts.
- [ ] Verify new allocations against the current decision at execution time.
  Exercise market deposit, optimizer, recommendations and batch withdrawals,
  including pending/stale data, a revoked approval and a healthy exit from an
  excluded market. Show the exact exclusion reason where a user can act on it.
- [ ] Validate the corpus, published source hashes and both cache layers. Close
  MBM #5 and reviews #6 after end-to-end propagation is observed. Confirm the
  Monad PT-USDat never appears in positive coverage, and stUSDS appears as
  excluded in MBM with its reason.

Current production on 2026-11-21 serves v1.6.17 at 2273391. The dataset index
tracks newer source independently. The observed 340 generated whitelist
entries and 36 legacy-unclassified review documents are different sets.
