# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DeFi protocol.

This project focuses on practical Morpho market exploration and action tooling, including:

- Markets table with live APR previews and filterable chain views
- Supply APR optimizer for rebalance and deposit planning, with wallet fallback defaults (10% baseline APR, with asset-specific overrides such as 4% for `WETH`)
- Batch withdraw flow for lower-APR-first exits
- Position recap grouped by lent asset, with cross-chain quick-switch pills and market-level deposit/withdraw flows
- Opportunity recap for coarse chain-level deployable yield evaluation
- Blacklist recap for reviewing user-hidden and unsafe collaterals

## Development

To run this project locally, follow these steps:

1.  **Install dependencies:**

    ```bash
    bun install
    ```

2.  **Start the development server:**
    ```bash
    bun dev
    ```
    The application will usually be available at `http://localhost:5173`.
    If that port is already in use, Vite will automatically choose the next free port.

### Collateral Whitelist (Optional)

This app can run without any precomputed whitelist.

If a market's collateral is unknown, it is highlighted in `yellow` and you can approve/ban it directly on the Market page.

In production, the app will try to load a precomputed whitelist from (in order):

1) a local static file: `public/whitelist.collaterals.json`
2) the artifacts repo: `https://neutronstar03.github.io/mbm-artifacts/v1/whitelist.collaterals.json`
3) a local browser cache (if previously fetched)

If none are available, the whitelist is treated as empty.

#### Pull Once (Recommended)

To download the current whitelist from the artifacts repo into your local `public/` folder:

```bash
bun run artifacts:pull
```

This is a one-time step; after that, `bun dev` can run fully offline.

To also pull the latest market blacklist dataset (optional):

```bash
bun run artifacts:pull:all
```

#### Generate Locally

To generate a whitelist locally (DefiLlama price validation + backoff):

```bash
bun run gen:whitelist:collaterals:reset
```

## Changelog

See `CHANGELOG.md` for the full release history. Recent updates:

- `v1.2.11` (2026-04-02): added a manual market blacklist overlay, hid those markets from portfolio/withdraw recaps, grouped Positions by lent asset with cross-chain quick-switch pills, and added a lower default Market APR override for `WETH`.
- `v1.2.10` (2026-04-01): made the Supply APR optimizer always open, removed the Start gate, and restored a visible asset placeholder.
- `v1.2.9` (2026-04-01): added the missing Base `RLP` Resolv-related asset to the permanent blacklist.
- `v1.2.8` (2026-04-01): enabled Monad collateral quick links across explorer/GeckoTerminal/CoinGecko and permanently blacklisted two reported scam-token assets on mainnet and Base.
- `v1.2.7` (2026-03-28): blacklisted direct Resolv assets and related wrapper families after the depeg so optimizer/discovery flows avoid new deposits there.
- `v1.2.6` (2026-03-25): simplified optimizer wallet fallback to a fixed 10% APR baseline, colored Market risk vault counts, and refreshed patch-level routing/build/test dependencies.
- `v1.2.5` (2026-03-23): added a Blacklist Recap review panel for user blacklist + unsafe collateral decisions, improved recap mobile UX, and restored the mobile `Bef 90%` Markets column.
- `v1.2.4` (2026-03-21): added local collateral blacklist controls, denser mobile market-page UI, richer optimizer opportunity cards, and refreshed app/tooling dependencies.
- `v1.2.3` (2026-03-16): optimizer now uses a Market APR threshold with wallet fallback, supports vault-informed baseline yield suggestions with Morpho deep links, and includes live tests for vault-derived APR selection.
- `v1.2.2` (2026-03-15): added a Markets Opportunity Recap, modularized major home/market feature files into page-local submodules, and unified shared deposit/withdraw form UI pieces.
- `v1.1.30` (2026-02-25): added baseline all-chain optimizer candidate filters (`netSupplyApy >= 1%`, `netSupplyApy <= 600%`, `borrowAssetsUsd >= $5`) for faster optimizer and Home Magic scan runs.
- `v1.1.29` (2026-02-24): magic scan now starts only from home, continues across route changes, records cooldown on completed scans, and keeps the magic header visible while background scanning is active.
- `v1.1.28` (2026-02-24): moved optimizer runs to a dedicated web worker (including magic scan), added compact in-button run progress, and reused Clear as Cancel while running.
- `v1.1.27` (2026-02-24): reduced magic optimizer cooldown to 30 minutes and added a periodic 60-second eligibility check so rescans can restart automatically after cooldown.
- `v1.1.26` (2026-02-24): background "magic optimizer" scan, opportunity cards, and short-lived precomputed optimizer results for faster click-to-optimize flows.
- `v1.1.25` (2026-02-24): moved shady/manual blacklist context from market list to asset list and documented policy in `AGENTS.md`.

## Live Version

A live version of this project can be deployed via GitHub Actions to GitHub Pages (tag-driven releases). You can access it here:

[https://neutronstar03.github.io/morpho-blue-markets/](https://neutronstar03.github.io/morpho-blue-markets/)
