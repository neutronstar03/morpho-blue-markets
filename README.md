# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DeFi protocol.

This project focuses on practical Morpho market exploration and action tooling, including:

- Markets table with live APR previews and filterable chain views
- Supply APR optimizer for rebalance and deposit planning, with wallet fallback defaults (10% baseline APR, with asset-specific overrides such as 4% for `WETH`) and sticky per-asset Market APR preferences
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

- `v1.4.7` (2026-04-22): refactored the Home optimizer, bundle execution, and batch-withdraw flows into page-local controller hooks and a shared Bundler3 market-params hook, and refreshed the repo agent docs for the current workflow/architecture.
- `v1.4.6` (2026-04-19): added manual rsETH blacklist entries across supported app chains with known deployments after the KelpDAO bridge exploit of 18 April so discovery and deposit flows avoid new deposits there.
- `v1.4.5` (2026-04-17): added Liquidations row to the Market page Collateral section showing total liquidation count per market (0 = red, >0 = green).

## Live Version

A live version of this project is deployed to Cloudflare Pages (tag-driven releases via GitHub Actions). You can access it here:

[https://mbm.ns03.dev](https://mbm.ns03.dev)
