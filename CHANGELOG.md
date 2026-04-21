# Changelog

All notable changes to this project will be documented in this file.

## v1.4.9 - 2026-04-22

### Changed
- blacklist: added manual `wrsETH` blacklist entries on Optimism and Base to extend the earlier post-KelpDAO blacklist coverage for the wrapped rsETH variant.

## v1.4.8 - 2026-04-22

### Changed
- infra: removed the unused `/api/vault-aprs` Cloudflare Pages Function and the dead frontend hook path that depended on it.
- data: whitelist and market-blacklist loaders now fall back directly to the canonical `https://neutronstar03.github.io/mbm-artifacts/v1/` datasets instead of a stale same-origin `/mbm-artifacts/...` path.
- repo: stopped tracking pulled/generated `public/whitelist.collaterals.json` and `public/blacklist.markets.json` files in this repo, while keeping local dev support via optional local files and browser cache fallback.
- docs: documented the Cloudflare Pages deploy flow and the separate runtime dataset/artifact flow in `AGENTS.technology.md` and `README.md`.

## v1.4.7 - 2026-04-22

### Changed
- refactor: split the oversized Home optimizer, bundle execution, and batch-withdraw entry components into page-local controller hooks so the TSX entrypoints stay presentation-focused while preserving existing behavior.
- refactor: added a shared `useMarketParamsById()` Bundler3 hook under `app/lib/` so optimizer and batch-withdraw execution flows reuse the same Morpho market-params loading path.
- docs: refreshed `AGENTS.md`, added `AGENTS.technology.md`, and added a form-writing companion doc to better document repo workflow, architecture, and agent-facing conventions.

## v1.4.6 - 2026-04-19

### Changed
- blacklist: added manual rsETH blacklist entries on supported app chains with known token deployments after the KelpDAO bridge exploit of 18 April, so discovery and deposit flows avoid suggesting those markets.

## v1.4.5 - 2026-04-17

### Added
- feat: Liquidations row in the Market page Collateral section showing total liquidation count for the market (0 = red, >0 = green). Sourced from the Morpho Blue GraphQL API transactions endpoint.

## v1.4.4 - 2026-04-16

### Changed
- feat: Added configurable "Skip optimization threshold" in Advanced Settings (default 0.25%, range 0–10%, 0.25% steps). Replaces the hardcoded 25 bps buffer; setting to 0% disables the no-op filter entirely.

## v1.4.3 - 2026-04-16

### Changed
- ui: Blacklist recap action buttons now show uniform "Enable Asset" text with green-themed styling, and fixed text wrapping in token names and button labels.
- feat: Added Advanced Settings section to Home for managing the Blacklist Recap visibility and future user preferences.

## v1.4.2 - 2026-04-15

### Changed
- infra: removed PWA artifacts (`site.webmanifest`, Android icons) and the manifest link since this is a backend-dependent DeFi webapp, not an installable PWA.

## v1.4.1 - 2026-04-15

### Changed
- ui: Home Positions asset-group summary now cycles through 3 states on click: total USD value → native token amount → yearly USD return.
- optimizer: Magic optimizer scan now uses stored Market APR values per asset (WETH defaults to 4%, stables share a grouped value, others default to 10% or user-set preference) instead of a hardcoded 10% for all assets.

## v1.4.0 - 2026-04-15

### Introduced
- feat: edge-cached API endpoints for Morpho market data (Cloudflare Pages Functions) — `/api/popular-loan-assets`, `/api/vault-aprs`, `/api/token-liquidity` — cache public GraphQL and GeckoTerminal data at the Cloudflare edge, serving instant placeholder data to the frontend while live queries refresh in the background.
- feat: Max Deploy optimizer strategy — hold positions whose APR >= a configurable base rate, only withdraw from markets below the base rate. Available alongside the existing Max Yield strategy via the optimizer strategy selector.
- feat: Market APR input now has +/- stepper buttons (0.25% step) for easier fine-tuning.
- feat: stablecoin Market APR grouping — USDC, USDT, USDS, frxUSD, AUSD, and PYUSD share one representative APR value so redundant stablecoin entries don't clutter the optimizer.

### Changed
- infra: fixed `cp -r` to `cp -R` in `preview:cf` and `deploy:cf` scripts for MSYS/Windows compatibility.
- infra: removed unused `version:*` and `release:*` npm scripts (manual version bump per AGENTS.md workflow instead).
- refactor: extracted `aggregatePopularLoanAssets()` from `usePopularLoanAssetsByChain` for shared use by the edge-cache placeholder query.

## v1.3.0 - 2026-04-13

### Introduced
- feat: migrated hosting to Cloudflare Pages with custom domain `mbm.ns03.dev`.
- feat: added anonymous analytics via a first-party Umami proxy and bundled v2 client with pageview and custom event tracking (wallet connect/disconnect, network switch, optimizer runs and outcomes, transaction outcomes, opportunity cards, market navigation).

### Changed
- infra: push-based CI/CD via GitHub Actions with tag-driven Cloudflare deploys.
- infra: removed `/morpho-blue-markets/` base path for root-path custom domain deployment.

## v1.2.19 - 2026-04-11

### Changed
- blacklist: expanded the manual Resolv asset blacklist to cover direct `USR`, `wstUSR`, and `RLP` token contracts across the currently discovered supported EVM deployments so optimizer/discovery flows avoid new deposits into the broader Resolv token family.

## v1.2.18 - 2026-04-08

### Fixed
- fix: home-page cross-chain quick-switch actions no longer persist a stale `requiredChainId`, so manually changing networks from the RainbowKit dropdown does not leave the navbar stuck showing an incorrect "Switch to ..." prompt.

## v1.2.17 - 2026-04-08

### Changed
- blacklist: added a micro manual blacklist for two reported Arbitrum `GVLT` asset contracts flagged as unreliable/scam so the app avoids suggesting fresh deposits there.

## v1.2.16 - 2026-04-04

### Introduced
- feat: added a shared Transaction Dock and success modal flow for multi-step wallet actions so optimizer, batch withdraw, deposit, and withdraw can report guided progress in one place.

### Changed
- ux: Supply APR optimizer and batch withdraw now chain their prerequisite approvals, signatures, and execution steps behind a single guided CTA instead of separate setup buttons.
- ux: deposit and withdraw forms now use the same dock-based transaction feedback, and optimizer execution clears its result state immediately after a successful run.
- ux: confirmation timeouts now show a shorter warning-style dock message (`Still pending. Speed up in wallet or view in explorer.`) with a non-error Clear action.

## v1.2.15 - 2026-04-04

### Changed
- ux: Home Positions asset groups can now open the Supply APR optimizer directly with the selected lent asset prefilled for faster rebalance and deposit flows.
- fix: hidden dust supply positions with zero derived assets are now filtered consistently across Positions, Batch Withdraw, Market positions, and Home Magic / optimizer candidate inputs.

## v1.2.14 - 2026-04-04

### Changed
- optimizer: Market APR is now remembered by asset symbol so manual thresholds persist across asset switches, chain changes, and reloads.
- optimizer: opportunity-card preset opens now reuse the remembered asset-specific Market APR when available instead of always resetting to the symbol default.
- ui: the optimizer Market APR helper now shows the active asset-specific default, and `AGENTS.md` documents the repo release workflow.

## v1.2.13 - 2026-04-03

### Changed
- ui: enriched Home Positions asset headers with per-asset weight and APR metadata using compact inline icons.
- ui: asset-group value summaries are now switchable between total USD and yearly USD via a shared clickable control, with consistent behavior across desktop and mobile.
- ui: simplified Home Position rows by removing redundant chain/loan-asset labels, hiding 100%-weight asset badges, and making supplied amounts more prominent.
- ux: added stable `data-testid` hooks for Home Positions asset-group headers and summary toggles to simplify inspection and future UI checks.

## v1.2.12 - 2026-04-02

### Changed
- data: updated Morpho GraphQL queries to use `marketId` and `loanAsset.price.usd` so the app stays compatible with the newer private API shape.
- fix: restored Home Position weighted APR, daily USD, per-asset totals, and per-market weights by falling back to price-derived USD values when GraphQL returns `state.supplyAssetsUsd = null`.
- optimizer: updated asset pricing and market identity plumbing used by Home Magic / Supply APR optimizer flows to rely on the newer GraphQL fields while preserving internal compatibility aliases.

## v1.2.11 - 2026-04-02

### Introduced
- feat: added a manual market blacklist dataset with comments so specific markets can be hidden locally without touching the generated market blacklist feed.

### Changed
- ui: Positions are now grouped by lent asset, ranked by current supplied value, and show per-asset value plus yearly return summaries.
- ui: Position weights now use current value within each asset group, and cross-chain footer pills let you jump to other chains with open lending positions.
- ui: manually blacklisted markets are hidden from Positions, Batch Withdraw, portfolio recap totals, and cross-chain pill counts.
- ui: Opportunity recap chain rows now remove the noisy yearly-dollar summary and let you switch chains directly from the chain label/icon.
- optimizer: added an asset-specific default Market APR override so `WETH` uses `4%` instead of the generic `10%` baseline in magic-scan and preset flows.
- refactor: split the Home Positions feature into local submodules under `app/pages/home/position/` to keep the main component readable.

## v1.2.10 - 2026-04-01

### Changed
- ui: made the Supply APR optimizer open by default, removed the Start gate, and kept the form visible after Clear.
- ui: restored a visible placeholder for the optimizer asset select when no asset is chosen.

## v1.2.9 - 2026-04-01

### Changed
- blacklist: added the missing Base `RLP` asset address to the permanent manual blacklist after the Resolv hack.

## v1.2.8 - 2026-04-01

### Changed
- ui: enabled Monad unknown-collateral quick links for explorer, GeckoTerminal, and CoinGecko.
- blacklist: permanently blacklisted the reported mainnet and Base scam-token asset addresses.

## v1.2.7 - 2026-03-28

### Changed
- blacklist: manually blacklisted direct Resolv asset addresses for mainnet `wstUSR`, mainnet `RLP`, mainnet `USR`, and arbitrum `RLP` after the depeg to prevent new deposits.
- blacklist: added targeted symbol-family blocking for related Resolv wrappers and Pendle derivatives (`aprUSR`, `MC-USR`, `PT-RLP-*`, `PT-sw-RLP-*`, `PT-USR-*`, `PT-wstUSR-*`, `LP-USR-*`, `bwPT-USR-*`).

## v1.2.6 - 2026-03-25

### Changed
- optimizer: removed the fetched vault/mainnet fallback yield path from Supply APR Optimizer and now default the wallet fallback baseline to 10% APR.
- ui: Market page `Risk` section now colors `Supplying Vaults` red when the count is `0` and green when it is greater than `1`.
- chore: refreshed selected patch-level dependencies (`react-router*`, `viem`, `vite`, `vitest`, `caniuse-lite`, `baseline-browser-mapping`).

## v1.2.5 - 2026-03-23

### Introduced
- feat: added a Blacklist Recap section on Home to review user-hidden assets and unsafe collateral bans in one place.

### Changed
- ux: footer Blacklist Recap link now opens and scrolls to the Home recap section, which can be closed again from its header.
- ux: blacklist recap stores token symbol/name for new entries, keeps older local-storage entries readable, and links token addresses to the chain explorer.
- ui: blacklist recap uses a denser desktop table and a simplified mobile layout with clearer reason labels (`User Blacklist`, `Unsafe collateral`).
- ui: restored the mobile Markets `Bef 90%` column in AdvancedList.

## v1.2.4 - 2026-03-21

### Introduced
- feat: added a local per-collateral blacklist mode that hides assets from optimizer/discovery suggestions while preserving positions, batch withdraw, and direct market access.

### Changed
- ux: market page now exposes local blacklist controls from a compact Advanced section with denser mobile spacing.
- ux: home optimizer opportunity cards now show absolute APR gain, relative improvement over the previous allocation, and daily/yearly return deltas in a denser desktop-friendly layout.
- optimizer: home magic suggestions now expire after 2 minutes, prune automatically, and share the same TTL as precomputed optimizer results.
- optimizer: background scan timing is now documented and tuned to a 60-second heartbeat, 10-minute scan cooldown, and 30-second read-cache TTL.
- chore: refreshed core app dependencies, upgraded Vite/Vitest/lucide, and kept RainbowKit on a wagmi v2-compatible stack.

## v1.2.3 - 2026-03-16

### Introduced
- feat: Supply APR Optimizer can now use a wallet fallback row and show a vault-informed baseline venue suggestion in the recap.
- feat: fallback venue suggestions can deep-link to the referenced Morpho vault page when a vault source is available.
- test: added live and unit coverage for vault-derived market APR selection, including popular asset reporting.

### Changed
- ux: replaced the old optimizer minimum move size control with Market APR and added Max / Zero deposit shortcuts.
- optimizer: sub-threshold markets are now skipped and excess capital can be left in wallet instead of being forced into lower-yield pools.
- optimizer: vault-derived baseline yield now uses rewards-aware `avgNetApy`, includes V1 + V2 vaults, applies a Mainnet floor, refreshes on a 10-minute cache window, and ignores blocked asset symbols such as `APXUSD` and `AUSD`.

## v1.2.2 - 2026-03-15

### Introduced
- feat: Markets view now includes an optional Opportunity Recap that summarizes conservative chain-level deployable size from the current supply filters.

### Changed
- ui: recap toggle lives in the Markets header and the recap hides low-signal chains below a hardcoded minimum deployable threshold.
- refactor: split Home Markets, Batch Withdraw, and Supply APR Optimizer into page-local submodules to keep feature-specific UI close to each tool.
- refactor: deposit and withdraw forms now share local market-action form primitives for submit buttons, notices, and unit toggles.

## v1.2.0 - 2026-03-03

### Introduced
- feat: collateral whitelist + market blacklist can be loaded at runtime (local `public/*.json`, artifacts repo fallback, and browser cache).
- feat: unknown collateral review on Market page with manual approve/ban decisions.
- feat: scripts to generate datasets locally (`gen:*`) and to pull artifacts once for offline dev (`artifacts:pull`).

### Changed
- ui: highlight unknown collaterals as `yellow` while keeping optimizer execution enabled.
- ui: market unknown-collateral panel is constrained to the right column on desktop.
- ui: prefer Defined.fi token deep links for collateral review.
- ci: GitHub Pages deploy is tag-only (`v*`) with manual dispatch support.

## v1.2.1 - 2026-03-03

### Fixed
- fix: market unknown-collateral panel icons now resolve correctly on GitHub Pages subpaths (BASE_URL-aware).

## v1.1.30 - 2026-02-25

### Changed
- perf: supply optimizer candidate-market fetch now applies baseline quality filters on all chains (`netSupplyApy >= 1%`, `netSupplyApy <= 600%`, `borrowAssetsUsd >= $5`) to avoid scanning low-signal and pathological markets.
- perf: applied the same candidate filters to Home Magic background scans for consistent behavior and faster end-to-end runs.

## v1.1.29 - 2026-02-24

### Changed
- ux: home magic scan now starts only when the user is on the home route, but keeps running if navigation happens mid-scan.
- fix: magic scan cooldown is now recorded when a scan actually completes, so interrupted scans do not block follow-up runs for 30 minutes.
- ui: kept the magic header visual active while scanning across routes so users can see background optimizer activity.

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
