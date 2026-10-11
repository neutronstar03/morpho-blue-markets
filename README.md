# morpho-blue-markets

An alternative frontend for the [Morpho Blue](https://docs.morpho.org/tools/onchain/) DeFi protocol.

This project focuses on practical Morpho market exploration and action tooling, including:

- Markets table with live APR previews and filterable chain views
- Supply APR optimizer for rebalance and deposit planning, with wallet fallback defaults (10% baseline APR, with asset-specific overrides such as 4% for `WETH`) and sticky per-asset Market APR preferences
- Batch withdraw flow for lower-APR-first exits
- Position recap grouped by lent asset, with cross-chain quick-switch pills and market-level deposit/withdraw flows
- Cross-network Positions, Supply APR optimizer, and Batch withdraw flows that read across chains and switch wallet networks only for writes
- Opportunity recap for coarse chain-level deployable yield evaluation
- Blacklist recap for reviewing user-hidden and unsafe collaterals, with optional wallet-authenticated sync across devices

Robinhood Chain mainnet (chain ID `4663`) is supported for market discovery, positions, supply optimization, and batch withdrawals. Market pages also use its explorer, GeckoTerminal liquidity data, and KyberSwap price estimates.

## Recent updates

- v1.6.14: Positions now opens every network by default and persists each chain section independently.
- v1.6.13: Positions now separates Vault V2 holdings into a vault-specific section and hides locally marked lost-value markets from totals.
- v1.6.12: Positions now keeps risky wallet holdings visible and shows Vault V2 rows as full vault share positions.

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
    Local `/api/*` calls run through Vite middleware using the Pages Function handlers. User-blacklist KV storage is an in-memory development shim and resets when the server restarts. Use `bun run preview:cf` for a built Cloudflare Pages preview.

### Verification

```bash
bun run typecheck
bun run lint:check
bun run test:unit
bun run test:ui:run
bun run build
```

Release-tag deployments run these checks before publishing. Bun discovers offline `tests/**/*.test.ts` automatically; RPC/GraphQL integration cases use `.live.test.ts` and run separately with `bun run test:live`. The optional private-wallet UI checks require `MBM_PRIVATE_POSITION_TEST_WALLET`. Normal branch pushes do not run the release deployment workflow; manual deployment also requires a release-tag ref.

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

This is a one-time local-only step that makes the downloaded risk datasets available without fetching their published copies. Market discovery, RPC reads, and price estimates still need network access. These downloaded files are ignored by git and should not be committed.

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

- `v1.6.14` (2026-07-04): Positions now opens every network by default and persists each chain section independently.
- `v1.6.13` (2026-06-22): Positions now separates Vault V2 holdings into a vault-specific section and hides locally marked lost-value markets from totals.
- `v1.6.12` (2026-06-22): Positions now keeps risky wallet holdings visible and shows Vault V2 rows as full vault share positions.

## Live Version

A live version of this project is deployed to Cloudflare Pages (tag-driven releases via GitHub Actions). You can access it here:

[https://mbm.ns03.dev](https://mbm.ns03.dev)
