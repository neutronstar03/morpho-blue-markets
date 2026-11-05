# Shared collateral decisions (#5)

Goal: consume explicit binary research decisions and preserve exclusion precedence.

- [x] Define canonical review decision/reason and generated decisions.v1.json manifest in the review repository.
- [x] Replace path-only positive coverage at edge and dev boundaries; remove boolean review-presence approval from market risk.
- [x] Load decisions independently of home/manual optimizer lifecycles, retain the last valid manifest on transient failures.
- [x] Apply negative decisions before personal/shared allow signals; preserve existing exclusions and reasons.
- [x] Show outcome/provenance/reason in existing market labels used by list, detail, optimizer and batch results.
- [x] Provide explicit review-request action, read existing issues by exact chain/address first, then open existing/prepopulated issue.
- [x] Verify malformed/oracle paths, identities, decisions, conflicts, rank-independent outcomes, publication propagation and failure retention.
- [x] Types, lint, build, 104 offline tests and 35 UI tests pass (2 existing skips).
- [ ] Verify the actual deployed consumer and cache propagation; public reviewed-collaterals returned HTTP 502 during this run.
- [ ] Complete the five requested collateral research/classification issues with primary/onchain evidence and effective publication.

The raw manifest refreshes every five minutes; the positive compatibility API has a
five-minute edge TTL. GitHub raw caches can add delay. A source commit is not proof
that an unreleased consumer is active. No release, tag or separate deployment was made.
Existing review files remain descriptive until explicitly classified; the frozen legacy
list is never an allow signal. New unclassified collateral artifacts fail validation.
No real wallet is used. Production propagation remains unverified, so #5 stays open.
