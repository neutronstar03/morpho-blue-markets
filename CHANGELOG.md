# Changelog

All notable changes to this project will be documented in this file.

## v1.1.28 - 2026-02-24

### Changed
- perf: moved supply optimizer compute to a dedicated web worker to avoid blocking the main thread during optimization runs.
- perf: switched home magic optimizer scan runs to the same worker-backed path for non-blocking background evaluations.
- ux: optimizer action now shows compact in-button progress while running; cancel is exposed through the existing header Clear control.

## v1.1.27 - 2026-02-24

### Changed
- ux: home magic optimizer cooldown reduced from 60 minutes to 30 minutes for faster follow-up scans.
- perf: added a 60-second periodic background eligibility check so magic scan can restart when cooldown expires even without manual refresh.

## v1.1.26 - 2026-02-24

### Introduced
- feat: background home "magic optimizer" scan that evaluates each supplied loan asset once per chain and surfaces opportunity cards.
- feat: short-lived precomputed optimizer results (warm cache) for popup-driven open flows to avoid an immediate rerun.

### Changed
- ux: clicking an opportunity card now preconfigures the optimizer, scrolls to it, and dismisses the clicked card.
- ui: top bar gets an animated "magic" background while scanning, with optional force-preview toggle for look-testing.

## v1.1.25 - 2026-02-24

### Changed
- data: moved manual/shady blacklist context from `blacklist.markets.json` to `blacklist.assets.json`.
- docs: updated `AGENTS.md` blacklist policy to keep market blacklist generator-shaped and store manual notes on assets.

## v1.1.24 - 2026-02-24

### Changed
- data: blacklisted a shady market entry and bumped package version.

## v1.1.23 - 2026-02-22

### Changed
- ux: optimizer now shows a loading spinner while candidate markets are loading instead of returning a premature error state.

## v1.1.22 - 2026-02-09

### Introduced
- feat: reusable `Select` and `Badge` UI primitives with loading-capable button states.

### Changed
- ui: refreshed home controls (markets filters, optimizer, batch withdraw) to use consistent select/button/input components.
- ui: improved mobile density for optimizer, batch withdraw, and positions; made comparison `<`/`>` selector clearer.
- ui: show immediate APR on mobile markets table and hide chain column when a single chain is selected.
- ui: updated deposit/withdraw alert colors to match the app dark theme.

## v1.1.21 - 2026-02-01

### Introduced
- feat: batch withdraw (beta) flow to withdraw from lower-APR positions first.

### Changed
- ux: documented beta status and algorithm limitations for the initial batch-withdraw strategy.

## v1.1.20 - 2026-01-25

### Changed
- optimizer: updated greedy iteration strategy to converge faster and respect `maxMarketsUsed` more reliably.
- perf: tuned optimizer loop target to keep runs bounded and more responsive.

## v1.1.19 - 2026-01-20

### Changed
- rates: aligned live, preview, and optimizer displays on APR semantics and refreshed related labels/tests.

## v1.1.18 - 2026-01-20

### Fixed
- fix: resolved an infinite hook loop introduced in the previous release.

## v1.1.17 - 2026-01-20

### Changed
- ui: footer includes a "Wipe cache & reload" action.
- fix: improved local-storage hook reliability.

## v1.1.16 - 2026-01-19

### Changed
- ux: reset supply APY optimizer state when switching networks to avoid stale results.

## v1.1.15 - 2026-01-18

### Introduced
- feat: reusable market APY preview component with UI tests for utilization and APY rows.

### Changed
- fix: display supply rates as APR consistently to avoid misleading APY spikes in previews.
- ux: deposit/withdraw preview logic uses IRM-only math with clearer fallbacks when data is missing.

## v1.1.14 - 2026-01-18

### Introduced
- feat: optimizer suggests popular assets on the connected chain for preview without existing positions.

### Changed
- chore: remove unused hook and annotate chain metadata.
- revert: remove minimal Cloudflare analytics in production builds.

## v1.1.12 - 2026-01-17

### Introduced
- feat: move planning artifacts into `tasks/` directory.
- feat: generate market + asset blacklist sources from Morpho GraphQL warnings.
- feat: chunk supply APY optimizer on-chain reads and log skipped markets.
- feat: blacklist expired Pendle markets (PT and Wrapped-LP).

## v1.1.11 - 2026-01-15

### Introduced
- feat: automatic allocation size detector (move-size heuristic Auto step size).

## v1.1.10 - 2026-01-12

### Fixed
- fix: high-APY small markets skewing average APY.
- fix: avoid dust from asset/share rounding during allocations.

## v1.1.9 - 2026-01-10

### Introduced
- feat: optimizer uses Morpho Bundler3 to execute all moves in a single tx.
- feat: bundler execution UI for optimizer flows.

## v1.1.8 - 2026-01-08

### Introduced
- feat: optimizer exposes a max-markets option.

### Changed
- ui: improved mobile spacing.

## v1.1.7 - 2026-01-08

### Introduced
- feat: market list APY computed on connected chain.

### Changed
- ux: market header improvements.
- tweak: optimizer minimum improvement threshold set to +0.25%.

### Fixed
- fix: liquidity estimation reliability via Geckoterminal API.

## v1.1.6 - 2026-01-06

### Changed
- ui: safeness index now uniform across multiple markets.

## v1.1.5 - 2026-01-06

### Changed
- ui: refresh action updates popup state.

## v1.1.4 - 2026-01-06

### Introduced
- feat: real-time APY on positions.

### Changed
- refactor: shared library code extraction.

## v1.1.3 - 2026-01-06

### Introduced
- feat: optimizer prefill actions.

## v1.1.2 - 2026-01-05

### Changed
- ui: uniform token value display.

## v1.1.1 - 2026-01-05

### Introduced
- feat: optimizer deposit input for new deposits.

### Changed
- ux: market page uses IRM-calculated APY instead of stale GraphQL values.

## v1.1.0 - 2026-01-04

### Introduced
- feat: supply optimizer feature set and UI.
- feat: token/% switcher for supply-withdraw inputs.

### Changed
- infra: local IRM implementation with utilization/APR preview.

## v1.0.3 - 2025-12-25

### Introduced
- feat: new chain support.

### Fixed
- fix: Hyperliquid Morpho app link.

## v1.0.2 - 2025-12-24

### Changed
- ui: footer added.

## v1.0.1 - 2025-12-24

### Changed
- app: filter out borrow positions in the UI.

## v1.0.0 - 2025-12-23

### Introduced
- feat: faster user position loading with RPC sourcing.
