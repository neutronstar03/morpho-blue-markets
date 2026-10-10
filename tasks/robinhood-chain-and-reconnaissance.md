# Robinhood Chain support and project reconnaissance

## Goal

Add Robinhood Chain mainnet (4663) to MBM and identify concrete follow-up improvements after the last release on 2026-07-04.

## Checklist

- [x] Verify network metadata, Morpho deployments, and third-party data support against primary sources and live endpoints.
- [x] Register the chain for wallets, market discovery, positions, optimizer/batch writes, links, and artifact generation.
- [x] Verify integration with regression checks, live read/simulation probes, typecheck, lint, and build.
- [x] Record prioritized reconnaissance findings with evidence and limitations.
- [x] Done: commit the verified integration and deliver the findings; deployment/release is a separate request.

## Verified sources (2026-10-11)

- Network: https://docs.robinhood.com/chain/add-network-to-wallet/
- Morpho API coverage: https://docs.morpho.org/developers/api/get-started/
- Morpho core and legacy Bundler3 registry: https://github.com/morpho-org/sdks/blob/d98eca535fdbf389b2a77e2d42f1dd10cb78139e/packages/morpho-ts/src/addresses.ts
- Network definition: https://github.com/wevm/viem/blob/main/src/chains/definitions/robinhood.ts
- Live RPC confirms chain 4663 and bytecode at Morpho, Bundler3, GeneralAdapter1, Permit2, and Multicall3 addresses.
- Morpho GraphQL returns Robinhood markets using the same core address as the registry.
- GeckoTerminal network, CoinGecko asset platform, KyberSwap aggregator, and DefiLlama price keys all use `robinhood`.

## Implementation and validation

- Added a local viem definition because the pinned dependency has no Robinhood mainnet export; no dependency or lockfile changes.
- Registered the wallet transport, Morpho core, legacy Bundler3 adapter, Permit2 chain context, chain icons, external links, price/liquidity providers, and generator chain lists.
- Regression checks: `bun test tests/chains/robinhood.test.ts tests/bundler3/optimizer-bundle-builder.test.ts tests/batch-withdraw-plan.test.ts` (8 passed).
- UI checks: `bun run test:ui --run` (6 passed; 2 existing private-wallet checks skipped without their environment variable).
- Required checks: `bun run typecheck`, `bun run lint`, and `bun run build`.
- Live checks: the application's optimizer market query returned Robinhood markets; Multicall3 decoded market parameters and supply/borrow state; adapter `MORPHO()` and `BUNDLER3()` matched the registry; a Bundler3 dispatch of an adapter getter simulated successfully; the app's KyberSwap parser accepted a WETH/USDG quote.
- Browser check: selected Robinhood in Markets, loaded its results and a market detail page, and confirmed live APR, oracle drift, liquidity, and explorer/provider links. No wallet was connected and no transaction was submitted.
- Build emitted non-blocking warnings about stale browser metadata and dependency annotations. The existing two-runner test setup remains unchanged.
- Updated the generator inputs. This does not republish the separate `mbm-artifacts` dataset repository; previously unknown collaterals remain subject to the existing review flow.

## Reconnaissance findings

These are follow-up recommendations, not changes made in this task. Priorities describe the relative order for this project; effort is a rough implementation estimate.

| Priority | Finding and effect | Evidence | Suggested change / effort |
| --- | --- | --- | --- |
| 1 | Positions has a conditional hook-order defect. `PositionListItem` returns on zero supplied assets before later hooks. Borrow/collateral-only positions remain in the parent groups, so a zero-to-positive supply transition can change the same component's hook count and crash rendering. | `app/pages/home/position/position-list-item.tsx:30`, `position-utils.ts:48`, `position-groups.tsx:114` | Run all hooks before the guard and cover the transition. Small. |
| 2 | Submission timeouts can be misreported as delayed confirmations. One try/catch covers both the wallet write and receipt wait, and the classifier matches any message containing `timeout`/`timed out`. A write timeout with no transaction hash can therefore get the pending-transaction message. | `app/lib/transactions/use-chained-transaction-flow.ts:26` and `:173` | Separate submission from confirmation and classify receipt-wait errors specifically. Small to medium. This was established from control flow; no real wallet timeout was induced. |
| 3 | Release CI builds and deploys without typecheck, lint, or either test runner. Vitest only includes UI `.test.tsx` files; the math, optimizer, bundle, and dataset `.test.ts` files use Bun and have no package script or workflow invocation. | `.github/workflows/deploy.yml:21`, `vitest.config.ts:8`, `package.json:35`, `tests/irm/`, `tests/optimizer/`, `tests/bundler3/` | Add explicit offline unit/UI scripts and enforce them before deploying. Separate live RPC/private-wallet tests from deterministic CI. Small to medium. External CI was not inspected. |
| 4 | Chain capability mappings drift. Stable (988) is in the Morpho registry, Bundler3 registry, and icons but absent from wallet configuration. Monad has a GeckoTerminal review link but is absent from both liquidity-fetch mappings. | `app/lib/addresses.ts`, `app/lib/wagmi.ts:47`, `app/lib/hooks/use-token-liquidity.ts:6`, `functions/api/token-liquidity.ts:13`, `app/pages/market/components/market-risk-validation.tsx:23` | Use one typed chain/capability registry consumed by wallets, providers, and generators, with a consistency check. Medium. This task adds Robinhood to the existing structures only. |
| 5 | Last-resort risk datasets have no visible freshness policy. Four loaders store `cachedAtMs` but ignore it on read; failed network fetches can use arbitrarily old whitelist, blacklist, unhealthy-market, or oracle metadata. | `app/lib/collateral-whitelist.ts:75`, `market-blacklist.ts:98`, `unhealthy-markets.ts:89`, `oracle-providers.ts:75` | Preserve cache age in state, indicate stale data, retry failed loads, and choose dataset-specific expiry behavior. A shared loader would prevent drift. Medium; the appropriate offline fallback is a product decision. |
| 6 | Live APR in Markets unnecessarily depends on wallet connection/network. Selecting Robinhood while disconnected renders the immediate APR column as dashes even though the detail page reads and computes its APR successfully without a wallet. | `app/pages/home/advanced-list/index.tsx:187` and `:204` | Pass the selected chain explicitly to `useLiveMarketApr` and gate wallet switching only for writes. Small. Observed in the browser on Robinhood. |
| 7 | Keyboard/accessibility gaps: the main optimizer opportunity card is a clickable div; the transaction dialog has no focus management/Escape behavior; the additional supply amount label is not associated with its input. | `app/routes/home.tsx:243`, `app/components/transaction/transaction-success-modal.tsx:22`, `app/pages/home/supply-apr-optimizer/optimizer-form.tsx:253` | Use semantic buttons, a dialog primitive, and associated labels. Small to medium. |
| 8 | Two Morpho API hosts and duplicated edge/frontend queries increase maintenance work. Detail pages and the blacklist generator use `blue-api`, while the shared client uses `api`. The popular-assets query is copied into a Pages Function. | `app/lib/graphql/client.ts:3`, `app/lib/hooks/graphql/use-market.ts:6`, `scripts/blacklist-generator.ts:3`, `functions/api/popular-loan-assets.ts:7` | Share endpoint/query modules as already done for `markets-by-chain`. Small. Both detail and market-list paths worked during this task; no current host outage or schema lag was established. |
| 9 | Documentation and cleanup lag: README still describes Wrangler proxy development and says artifact downloads allow fully offline development, although market reads still need network access. The 0x swap endpoint says it is retained for one release, but remains wired into dev. | `README.md:39`, `README.md:63`, `functions/api/swap-estimate.ts:1`, `vite.config.ts:64` | Correct the development/offline description and decide whether to remove the deprecated endpoint. Small. |

Suggested next batch: fix 1 and 2, add the release verification gate (3), then consolidate the chain registry (4). The remaining changes can be grouped into data freshness and UX cleanup.
