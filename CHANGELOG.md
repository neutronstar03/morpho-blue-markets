# Changelog

All notable changes to this project will be documented in this file.

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
