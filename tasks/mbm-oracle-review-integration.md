# MBM Oracle Review Integration Notes

This note is for an agent working on MBM. It describes how MBM should consume the additive oracle review files from this repository.

## Summary

Collateral reviews already live under `v1/chain/{chainId}/{collateralAddress}.json`.

Oracle reviews are an additive v1.1 resource and live under:

```text
v1/chain/{chainId}/oracle/{oracleAddress}.json
```

The frontend does not need to fetch these files directly. MBM can keep using its Cloudflare/data-fetching layer to compose a single response for the UI:

1. Resolve the Morpho market params.
2. Fetch the collateral review by collateral token address.
3. Fetch the oracle review by market oracle address.
4. Merge both into one response returned to the frontend.

This keeps the frontend simple while allowing the backend/cache layer to have richer lookup logic.

## File lookup

Given a Morpho market with:

- `chainId`
- `collateralToken`
- `oracle`

Look up:

```text
v1/chain/{chainId}/{lowercaseCollateralAddress}.json
v1/chain/{chainId}/oracle/{lowercaseOracleAddress}.json
```

Example:

```text
v1/chain/1/0x91d14789071e5e195ffc9f745348736677de3292.json
v1/chain/1/oracle/0x0798de3ddb22c289a653c020863aaa7ef33c05d7.json
```

If the oracle review is missing, return the collateral review normally and omit the oracle section or return `null` for it. Missing oracle reviews should not break the market page.

## Oracle review JSON shape

Oracle review files use a compact v1.1 schema designed for a small UI/mobile section.

```json
{
  "version": "1.1",
  "chainId": 1,
  "oracleAddress": "0x...",
  "type": "chainlink-compatible",
  "provider": "API3",
  "rank": 3,
  "pricing": "COMP/USD divided by USDC/USD using API3 ReaderProxy feeds.",
  "notes": "Direct pair route, but depends on API3 dAPI configuration rather than native Chainlink feeds.",
  "sources": [
    {
      "label": "Oracle contract",
      "url": "https://etherscan.io/address/0x..."
    }
  ]
}
```

## Field notes

- `version`: string literal `"1.1"` for additive oracle reviews.
- `chainId`: EVM chain ID.
- `oracleAddress`: lowercase Morpho market oracle address.
- `type`: short human-readable category, such as:
  - `chainlink`
  - `chainlink-compatible`
  - `erc4626-vault`
  - `pendle`
  - `redstone`
  - `pyth`
  - `meta-oracle`
  - `custom-adapter`
  - `unknown`
- `provider`: short provider/protocol label, such as `Chainlink`, `API3`, `Redstone`, `Pendle`, `Pyth`, `Chronicle`, `Midas`, `ERC4626`, or `Unknown`.
- `rank`: quick reviewer score from `1` to `5`.
- `pricing`: one short sentence describing how the oracle prices collateral in loan-token terms.
- `notes`: one short caveat/comfort summary for reviewers.
- `sources`: links that justify the entry. Prefer contract pages, official docs, provider docs, and relevant source code.

## Rank semantics

- `1`: very weak / opaque / avoid.
- `2`: concerning; unclear data source, upgradability, stale feeds, or heavy custom logic.
- `3`: acceptable with caveats; understandable but has meaningful trust assumptions or custom dependencies.
- `4`: solid and understandable; reputable provider and limited complexity.
- `5`: very strong; simple, transparent, battle-tested, and minimal assumptions.

`rank` is a human review signal, not a formal proof. It should be displayed as a compact risk/quality indicator, similar to collateral rank.

## Suggested composed API response

The Cloudflare layer can return something like:

```json
{
  "collateralReview": {
    "version": 1,
    "chainId": 1,
    "collateralAddress": "0x...",
    "rank": 4
  },
  "oracleReview": {
    "version": "1.1",
    "chainId": 1,
    "oracleAddress": "0x...",
    "provider": "API3",
    "rank": 3
  }
}
```

Exact response shape can remain MBM-specific. The important requirement is that the frontend gets a small `oracleReview` object suitable for display.

## UI guidance

Display a compact section, similar to the current collateral review:

- Type
- Provider
- Rank
- Pricing
- Notes
- Sources

Avoid large dependency graphs or detailed feed trees in the frontend. Detailed research should be compressed into `pricing` and `notes`.

## Relation to coarse Monarch metadata

MBM may also expose a coarse `oracleProvider` key derived from Monarch metadata. That key is useful when no curated oracle review exists, but it is not a substitute for a v1.1 oracle review.

Suggested behavior:

1. If curated `oracleReview.provider` exists, use it.
2. Else if coarse `oracleProvider` exists, display it as lightweight provider metadata.
3. Else omit provider or show `Unknown`.
