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

## Dataset publisher integration (2026-11-05)

- [x] Share exact-chain/address publication policy between whitelist and blacklist generators.
- [x] Retain published legacy whitelist entries as legacy data; add only explicit positives.
- [x] Remove explicit negatives and durable asset exclusions from whitelist; project exclusions to discovered market IDs.
- [x] Separate identity-only research discovery from display metadata validation. A missing ticker does not prevent decision publication or confer approval.
- [x] Register and validate generator GraphQL contracts offline and against the live schema.
- [x] Live dry run: 350 seeded legacy entries become 338 after existing exclusions; 155 research candidates remain unapproved.
- [ ] Restore and verify actual GitHub Pages dataset publication and recorded source hashes.

The publisher consumes the review checkout's validated decision manifest and copies
it into the versioned dataset bundle. Explicit decisions and stronger durable
exclusions are authoritative inputs; generated JSON is not the place to persist a
research decision. Discovery is a temporary research queue, not a completed outcome.

## Overlapping whitelist provenance (2026-11-06)

- [x] Reproduce a published whitelist entry hiding the explicit shared review reason.
- [x] Prefer the shared whitelist decision after stronger exclusions and personal decisions,
  before the generated whitelist fallback, so classification provenance remains visible.
- [x] Exercise positive/negative decisions and oracle exclusion with the same loaded dataset.
- [x] Node 20.20.2: lint, typecheck, 157 offline tests and 50 UI tests pass (2 existing skips).
- [ ] Production propagation remains pending; no release or software deployment is part of this run.

The current production compatibility endpoint responds HTTP 200 but returns 39
entries, compared with 2 explicit positive decisions in the manifest. The extra
37 legacy paths show that positive-only consumer propagation is still unverified.
Do not close the integration or dependent research issues on this source fix alone.
The system Node 26 runtime failed UI tests because localStorage was unavailable;
verification uses the repository-required Node 20 runtime installed in isolation.
