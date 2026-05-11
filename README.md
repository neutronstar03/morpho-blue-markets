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

#### Generate Locally

To generate a whitelist locally (DefiLlama price validation + backoff):

```bash
bun run gen:whitelist:collaterals:reset
```

## Changelog

See `CHANGELOG.md` for the full release history. Recent updates:

- `v1.4.16` (2026-05-11): added compact market usage beside portfolio weight in Home Positions, with accessible labels and native tooltip hints.
- `v1.4.15` (2026-05-03): added locally projected accrued position values, a Market page projected amount tooltip with last onchain market update timing, and viewing-wallet support via `#w=<address>`.
- `v1.4.14` (2026-05-02): merged manual market-id blacklist entries into generated artifacts and made system-blacklisted markets disappear from positions, chain pills, and batch withdraw options.

## Live Version

A live version of this project is deployed to Cloudflare Pages (tag-driven releases via GitHub Actions). You can access it here:

[https://mbm.ns03.dev](https://mbm.ns03.dev)
