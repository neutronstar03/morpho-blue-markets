# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DeFi protocol.

This project focuses on practical Morpho market exploration and action tooling, including:

- Markets table with live APR previews and filterable chain views
- Supply APR optimizer for rebalance and deposit planning
- Batch withdraw flow for lower-APR-first exits
- Position recap and market-level deposit/withdraw flows
- Opportunity recap for coarse chain-level deployable yield evaluation

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
    The application will be available at `http://localhost:5173`.

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
