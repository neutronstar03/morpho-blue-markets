# MBM maintenance iteration and release plan

## Goal

Resolve all nine findings in `tasks/robinhood-chain-and-reconnaissance.md`, include the committed Robinhood integration, and publish one patch release after integration and verification. Expected release: `v1.6.15`, subject to checking the current version immediately before release.

## Checklist and done criteria

- [x] #1 Positions: zero/positive supplied-asset transitions keep hook order stable and pass a render regression check.
- [x] #2 Transactions: submission errors fail the flow; receipt timeouts retain a known hash and show delayed confirmation; successful/reverted receipts keep their correct outcomes.
- [x] #3 Release CI: release-tag deployments run frozen dependency install, non-mutating lint, typecheck, offline Bun tests, UI tests, and build before deployment. Branch pushes/PRs do not trigger this workflow; manual deployment is restricted to release-tag refs.
- [x] #4 Chains: one typed capability registry feeds chain consumers/generators; Stable wallet/RPC support and Monad liquidity mappings are verified; Robinhood remains covered.
- [x] #5 Datasets: cache freshness/source is visible, failed loads can recover, and stale restrictive datasets remain distinguishable from missing data; local/manual exclusions preserve precedence.
- [x] #6 Live APR: the selected chain loads immediate APR without wallet connection or wallet-chain switching; unknown/unconfigured chains stay explicitly unavailable.
- [x] #7 Accessibility: opportunity action works with keyboard; dialog moves/traps/restores focus and handles Escape; identified input labels are associated with controls.
- [x] #8 GraphQL: one shared endpoint and one shared popular-assets query are used across browser, Pages Function, and generators; payload semantics and local API behavior remain compatible.
- [x] #9 Cleanup: remove the unused 0x endpoint and its Vite/env wiring; correct development/offline documentation; keep KyberSwap price estimation intact.
- [ ] Done/release: all nine checks above are complete, required verification and targeted browser/live-read checks pass, README/CHANGELOG/package version are updated together, the release commit and matching tag are pushed, tag CI/deployment succeeds, and the production version is checked.

## Execution model

Use the current checkout, with at most three active implementation subagents and explicit disjoint file ownership. No worktrees. The coordinator owns cross-task decisions, repository-wide lint autofix, final checks, commits, release files, pushing, and deployment verification. Subagents run their targeted checks and return changed paths and evidence; they do not commit, push, tag, deploy, run global autofix, or revert another agent's changes.

Implement in two waves, followed by integration and release. Start an independent wave-2 assignment as its agent slot becomes free; wait for the relevant handoff where files overlap. All work is tracked by the issue numbers above.

| Stage | Owner | Issues | Responsibility |
| --- | --- | --- | --- |
| Wave 1 | Subagent A | #1, #6 | Positions hook order and selected-chain live APR; focused render/RPC-mocking regressions. |
| Wave 1 | Subagent B | #2 | Transaction submission/confirmation distinction and focused flow tests. |
| Wave 1 | Subagent C | #4 | Typed chain capabilities and migration of wallet/provider/generator consumers. |
| Wave 1 | Coordinator | #3 | Offline/live test classification, test scripts, release-tag-only CI checks, and initial integration. |
| Wave 2 | Subagent A | #7 | Keyboard, dialog focus behavior, and form labels; uses the completed transaction behavior without editing the transaction helper. |
| Wave 2 | Subagent B | #5 | Shared dataset-fetch/cache lifecycle and compact freshness indicator, preserving existing risk lookup APIs. |
| Wave 2 | Subagent C | #8 | Environment-neutral Morpho endpoint/query modules and their browser/edge/script consumers. |
| Wave 2 | Coordinator | #9 | Remove deprecated 0x server endpoint/wiring and update documentation; preserve the live KyberSwap hook. |
| Integration | Coordinator | All | Review combined changes, resolve handoff issues, run complete checks and browser smoke checks, and complete issue checklist. |
| Release | Coordinator | Release | Prepare and publish the patch release, then observe tag CI and production. |

## Dependencies and file ownership

- #1 and #6 can start independently of #2 and #4. #6 consumes the existing chain-name/ID API; #4 preserves those exports while deriving them from the registry. Integrate both before testing Stable/Robinhood market reads.
- Schedule #4 before #8 for file ownership and integration, not because GraphQL requires the new registry. The collateral/oracle generators belong to #4 in wave 1; the blacklist generator belongs to #8 in wave 2. #5 remains independent of #8 because freshness changes stay in runtime loaders, not artifact generators.
- #2 owns `app/lib/transactions/use-chained-transaction-flow.ts` and new transaction regression tests. #7 owns the success modal, opportunity-card markup, optimizer/batch form labels, and accessibility tests. Preserve the public delayed-confirmation contract during #2 so #7 does not need to edit it.
- #5 owns the four dataset loaders, a small shared loader/freshness module, and a dedicated status component mounted through `app/lib/providers.tsx`. #7 does not modify providers or dataset loaders; #8 does not modify them either.
- #8 owns `app/lib/graphql/`, `use-market.ts`, `use-popular-loan-assets-by-chain.ts`, `functions/api/popular-loan-assets.ts`, and `scripts/blacklist-generator.ts`. #9 owns only the deprecated swap endpoint, its Vite route/import/env entries, related environment declarations, and documentation.
- #3 and release preparation share `package.json`; the coordinator keeps ownership throughout. #9 and release preparation share README; update the release section only after cleanup is integrated.
- Tests use task-specific paths. The coordinator handles test discovery/config changes; agents may add tests but coordinate any test-file rename with #3.

## Architecture and compatibility

Keep the chain capability registry as dependency-free plain data so both browser and Pages Functions can consume it. Wallet chain objects and React icon components remain in their existing adapters. Derive supported-chain lists and provider mappings from the registry, preserve current public exports, and model an unavailable provider as an explicit capability state rather than inventing a network slug. Check the pinned viem version for Stable before choosing an existing export or a local chain definition.

Shared GraphQL modules export plain query strings and normalized contract types without browser/React imports. Preserve selection sets and the `SingleMorphoMarket` re-export while extracting them. Prefer the existing shared-client endpoint `api.morpho.org`, subject to live equivalence checks of the detail and generator requests before migrating the legacy host.

Keep the delayed-confirmation error and transaction-hook return contract stable. Tests exercise submission and receipt outcomes through the flow, including a submission timeout with no hash. For accessibility, the opportunity action and its dismiss control must be separate interactive elements; use the existing dialog dependency for focus handling where suitable.

## CI and verification policy

The deployment workflow remains tag-driven (`v*`). Add a release-tag ref guard so manual dispatch on a branch cannot deploy. Do not add branch-push or pull-request CI triggers for this iteration.

Deployment order: frozen install -> lint check (`eslint .`, no autofix) -> typecheck -> offline Bun tests -> UI tests -> build -> copy Pages Functions -> Cloudflare Pages deploy. Every verification step must succeed before deployment.

Separate live RPC/GraphQL and private-wallet cases from the default deterministic suite. File names alone are not enough: `tests/irm/adaptive-curve-irm.test.ts` currently calls RPC, and the two USDS optimizer files are also live. Retain these as opt-in live checks and ensure new offline `.test.ts` cases are automatically included by the unit runner. Keep the existing Vitest UI runner.

Run targeted meaningful regressions for #1, #2, #5, #6, and #7. For #4/#8, verify chain/provider consistency and query/response equivalence. Local verification includes `bun run typecheck`, lint, both offline/UI suites, and `bun run build`. Browser checks cover Robinhood and Stable selected-chain APR while disconnected, Positions transitions with fixtures, keyboard-only opportunity/dialog use, freshness/recovery display, and working local Pages Functions. Live checks are read-only RPC/GraphQL/price-provider probes; transaction flow outcomes are exercised with mocked wallet/receipt states.

## Dataset freshness policy

Make staleness observable without silently clearing known blacklist/unhealthy restrictions or changing existing risk decisions. Use a per-dataset configurable freshness window; label stale whitelist data so it is distinguishable from a freshly fetched approval signal. Keep manual user decisions and exclusions separate from generated freshness.

Track last successful fetch and cache acquisition time accurately; do not relabel these as dataset publication time. Preserve or migrate existing cached entries; legacy caches without valid timestamps are stale. A 404, other failed response, or invalid payload must fall back to cached data rather than replace it with an empty dataset; a valid empty payload remains legitimate. Show a compact stale/unavailable status with retry, preserve successful data during refresh, deduplicate concurrent loads, and retry on reconnect or after a bounded retry delay rather than treating `failed` as permanent. Final default windows should match the artifact publisher's actual cadence, checked during implementation.

## Release workflow

After all nine items are complete, prepare the next patch release and include Robinhood support in its notes. Update `package.json`, add the newest entry at the top of CHANGELOG, and keep README's recent-update sections to the latest three releases. Re-run release verification. Create the release commit `v1.6.15: add Robinhood support and fix maintenance issues` and matching tag (adjust together if the version changed), then push the branch and tag using the repository's anonymous GitHub persona. Follow the deployment workflow to completion and verify production's version metadata and a Robinhood market page.

## Execution evidence

- `7bd73ca`: implemented #1/#2/#3/#6/#9. Offline suite: 37 passed; UI suite: 15 passed, 2 optional private-wallet cases skipped; typecheck and production build passed. Global lint will run after all agent-owned edits and temporary probes finish.
- Browser: Robinhood selected while disconnected displayed live Immediate APR for all five visible market rows.
- Dataset publisher verified through its repository workflow: daily at 03:17 UTC, deployment only on content changes. Default fetch-age windows: blacklist/unhealthy 48h, whitelist 72h, oracle providers 7d. Publication age remains separate from last check time.
- Anonymous GitHub CLI and SSH alias identities verified; origin now uses `github.com-neutronstar03` for the eventual release push.
- Integrated release checks: 82 offline tests passed; 28 UI tests passed with 2 optional private-wallet cases skipped; typecheck, non-mutating lint, production build, and Wrangler Pages Functions compilation passed. `bun.lock` is unchanged.
- Browser after integration: Stable and Robinhood show live Immediate APR with no connected wallet. All four datasets load from the remote source and show fetch age separately from oracle publication date. Fixed and regression-tested the between-clock-ticks freshness label discovered during this smoke check.
- GraphQL: both Morpho hosts returned equivalent detail/popular-asset/generator selections in read-only probes; the local popular-assets Pages Function returns a validated response for Robinhood. Query aggregation semantics and malformed-response rejection have offline coverage.
- Position transitions, transaction outcomes, opportunity semantics, form labels, dialog focus/Escape/restoration, and dataset failure/recovery cases are covered through render/flow fixtures; no funded transaction was submitted.
- Prepared `v1.6.15` in package.json, README, and CHANGELOG; release publication/deployment verification remains the final unchecked criterion above.
