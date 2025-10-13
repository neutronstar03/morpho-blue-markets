# API Data Reference - Morpho Blue GraphQL

## 📊 Complete Field Reference

**Last verified:** October 13, 2025  
**Endpoint:** `https://blue-api.morpho.org/graphql`

This document serves as a quick reference for what data is available from the Morpho Blue API.

---

## ✅ CONFIRMED: API Provides Everything We Need!

### What API Actually Provides (VERIFIED)
**After testing with GraphQL schema, the API provides all essential fields:**

```typescript
{
  uniqueKey: string           // ✅ Market ID
  lltv: BigInt                // ✅ Loan-to-value (in wei: 980000000000000000 = 98%)
  oracleAddress: Address      // ✅ Oracle contract address
  irmAddress: Address         // ✅ Interest Rate Model address
  loanAsset: {
    address: string           // ✅ Token address
    symbol: string            // ✅ Token symbol (e.g., "cbBTC")
    name: string              // ✅ Token name (e.g., "Coinbase Wrapped BTC")
    decimals: number          // ✅ Token decimals (e.g., 8 for BTC)
  }
  collateralAsset: {
    address: string           // ✅ Same as above
    symbol: string
    name: string
    decimals: number
  }
  state: {
    supplyAssets: number      // ✅ Raw supply amount
    borrowAssets: number      // ✅ Raw borrow amount
    supplyAssetsUsd: number   // ✅ Supply in USD
    borrowAssetsUsd: number   // ✅ Borrow in USD
    supplyApy: number         // ✅ Supply APY (as decimal: 0.05 = 5%)
    borrowApy: number         // ✅ Borrow APY
    utilization: number       // ✅ Utilization rate (as decimal: 0.75 = 75%)
  }
  whitelisted: boolean        // ✅ Whitelisted status
  creationTimestamp: number   // ✅ Creation time
}
```

### What We DON'T Get (and don't need)
- ❌ `reserveFactor` - Not in Morpho Blue (it's in Compound/Aave)
- ❌ `collateralFactor` - Use `lltv` instead (Morpho's version)

**Bottom line: The API has everything! No data structure mismatch.**

## 📋 GraphQL Query Examples

### Fetch Markets with Filtering
```graphql
query GetMarkets($first: Int!, $skip: Int!, $where: MarketFilters) {
  markets(first: $first, skip: $skip, where: $where, orderBy: SupplyApy, orderDirection: Desc) {
    items {
      uniqueKey
      lltv
      oracleAddress
      irmAddress
      loanAsset {
        address
        symbol
        name
        decimals
      }
      collateralAsset {
        address
        symbol
        name
        decimals
      }
      state {
        supplyAssets
        borrowAssets
        supplyAssetsUsd
        borrowAssetsUsd
        supplyApy
        borrowApy
        utilization
      }
      whitelisted
      creationTimestamp
    }
  }
}
```

**Variables example:**
```json
{
  "first": 100,
  "skip": 0,
  "where": {
    "chainId_in": [8453],
    "supplyApy_gte": 0.05,
    "supplyApy_lte": 2.0,
    "supplyAssetsUsd_gte": 10000
  }
}
```

---

## 🔢 Data Format Reference

### LLTV (Loan-to-Value)
- **Raw value:** BigInt in wei (18 decimals)
- **Example:** `980000000000000000`
- **Formula:** `(lltv / 1e18) * 100` = `98%`

### APY (Annual Percentage Yield)
- **Raw value:** Decimal
- **Example:** `0.15` = 15%, `0.05` = 5%, `1.5` = 150%
- **Formula:** `apy * 100` = `15%`

### Utilization
- **Raw value:** Decimal
- **Example:** `0.75` = 75%
- **Formula:** `utilization * 100` = `75%`

### TVL (Total Value Locked)
- **Preferred:** Use `supplyAssetsUsd` (already in USD)
- **Fallback:** `supplyAssets` (raw token amount, needs decimals conversion)

---

## 🎯 Common Filters

```typescript
// Filter by chain
chainId_in: [1, 8453]  // Ethereum and Base

// Filter by APY range
supplyApy_gte: 0.05    // Minimum 5%
supplyApy_lte: 2.0     // Maximum 200%

// Filter by TVL
supplyAssetsUsd_gte: 10000  // Minimum $10k

// Filter by utilization
utilization_lte: 0.99  // Max 99% (exclude fully utilized)

// Filter by tokens
loanAssetAddress_in: ["0x..."]
collateralAssetAddress_in: ["0x..."]

// Whitelisted only
whitelisted: true
```

---

**See `project-status.machine.md` for current implementation status and next steps.**

