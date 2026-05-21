# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DeFi protocol.

This project focuses on practical Morpho market exploration and action tooling, including:

- Markets table with live APR previews and filterable chain views
- Supply APR optimizer for rebalance and deposit planning, with wallet fallback defaults (10% baseline APR, with asset-specific overrides such as 4% for `WETH`) and sticky per-asset Market APR preferences
- Batch withdraw flow for lower-APR-first exits
- Position recap grouped by lent asset, with cross-chain quick-switch pills and market-level deposit/withdraw flows
- Opportunity recap for coarse chain-level deployable yield evaluation
- Blacklist recap for reviewing user-hidden and unsafe collaterals, with optional wallet-authenticated sync across devices

## Recent updates

- v1.5.8: Added World Chain support across chain config, market links, liquidity, risk tooling, and Bundler3 execution.
- v1.5.7: Batch withdraw and Supply APR optimizer are now collapsible with sticky state and smooth animations.
- v1.5.6: Curated v1.1 oracle reviews now override generic Monarch-derived Oracle Provider labels and scores.

## Development

To run this project locally, follow these steps:

1.  **Install dependencies:**

    ```bash
    bun install
    ```

2.  **Start the development server:**
    ```bash
    bun run dev
    ```
    The application will usually be available at `http://localhost:5173`.
    If that port is already in use, Vite will automatically choose the next free port.
    Local `/api/*` calls are handled by a dev-only Vite middleware that mirrors the Cloudflare Pages Functions used in production.

### Collateral Whitelist (Optional)

This app can run without any precomputed whitelist.

If a market's collateral is unknown, it is highlighted in `yellow` and you can approve/ban it directly on the Market page.

The app will try to load a precomputed whitelist from (in order):

1) a local static file: `public/whitelist.collaterals.json`
2) the canonical published dataset: `https://neutronstar03.github.io/mbm-artifacts/v1/whitelist.collaterals.json`
3) a local browser cache (if previously fetched)

If none are available, the whitelist is treated as empty.

#### Pull Once (Recommended)

To download the current whitelist from the artifacts repo into your local `public/` folder:

```bash
bun run artifacts:pull
```

This is a one-time local-only step; after that, `bun dev` can run fully offline. These downloaded files are ignored by git and should not be committed.

To also pull the latest market blacklist dataset (optional):

```bash
bun run artifacts:pull:all
```

The full artifact pull also downloads optional oracle provider metadata and generated unhealthy-market risk data when available.

#### Generate Locally

To generate a whitelist locally (DefiLlama price validation + backoff):

```bash
bun run gen:whitelist:collaterals:reset
```

## Changelog

See `CHANGELOG.md` for the full release history. Recent updates:

- `v1.5.8` (2026-05-21): Added World Chain support across chain config, market links, liquidity, risk tooling, and Bundler3 execution.
- `v1.5.7` (2026-05-17): Batch withdraw and Supply APR optimizer are now collapsible with sticky state and smooth animations.
- `v1.5.6` (2026-05-17): Curated v1.1 oracle reviews now override generic Monarch-derived Oracle Provider labels and scores.

## Live Version

A live version of this project is deployed to Cloudflare Pages (tag-driven releases via GitHub Actions). You can access it here:

[https://mbm.ns03.dev](https://mbm.ns03.dev)
