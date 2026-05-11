# User blacklist sync plan

## Goal

Add a compact Cloudflare KV backed sync mode for user-managed market exclusion state without device keypairs. Users sign once per browser/device to obtain a backend sync token; after that, collateral blacklist and lost-value market actions sync silently.

## Scope

Sync only user-managed state:

- local collateral exclusions from `app/lib/local-market-exclusions.ts`
- local lost-value market exclusions from `app/lib/local-market-exclusions.ts`
- manual collateral risk decisions from `app/lib/market-risk/collateral-decisions` only if we explicitly decide they are user preferences, not system review state

Do not sync system/app-owned datasets:

- generated market blacklist
- manual committed market blacklist
- `blacklist.assets.json`
- collateral whitelist/artifacts

## Existing lost-value market functionality notes

The current branch adds local market lost-value exclusions:

- storage key prefix: `local-market-exclusions:v1:`
- market entries are keyed by `market:chainId:marketUniqueKey`
- legacy `local-collateral-blacklist:v1:` and `local-market-writeoffs:v1:` keys are migrated into the unified namespace on read
- market page Advanced controls allow writing off/restoring exact markets
- lost-value markets are included in `isMarketIdBlacklisted()` so they hide positions/totals/suggestions like strong market blacklists
- Blacklist Recap already lists and restores lost-value markets

The sync feature should treat lost-value markets as a first-class user exclusion type, not as generated/system market blacklist data.

## Simplified architecture

Use Cloudflare KV plus random bearer tokens.

### KV bindings

Add one namespace:

```toml
[[kv_namespaces]]
binding = "USER_BLACKLIST"
id = "<production-id>"
preview_id = "<preview-id>"
```

### KV keys

```txt
user-blacklist:v1:<lowercase-wallet>
user-blacklist-token:v1:<sha256-token>
```

### Synced blob shape

Prefer compact but readable JSON:

```json
{
  "v": 1,
  "u": 1710000000000,
  "c": {
    "1": {
      "0xcollateral": { "t": 1710000000000, "s": "wstETH", "n": "Wrapped liquid staked Ether" }
    }
  },
  "w": {
    "1": {
      "0xmarketid": { "t": 1710000000000, "ls": "USDC", "cs": "wstETH", "la": "0xloan", "ca": "0xcollateral" }
    }
  }
}
```

Where:

- `v`: schema version
- `u`: blob updated timestamp
- `c`: collateral blacklist by chain ID and collateral address
- `w`: lost-value market exclusions by chain ID and market unique key
- metadata fields are optional and short

Avoid tombstones in v1. Removals use last-write-wins on the whole blob. This is acceptable for a small preference feature; if conflict complaints appear later, add tombstones in v2.

## API plan

Create one Pages Function file:

```txt
functions/api/user-blacklist.ts
```

### `POST /api/user-blacklist`

Auth/bootstrap endpoint.

Input:

```json
{
  "wallet": "0x...",
  "message": "MBM blacklist sync...",
  "signature": "0x..."
}
```

Server behavior:

- validate wallet format
- verify signature with `viem` `verifyMessage`
- create 32-byte random token
- store token hash in KV with wallet and created timestamp
- return raw token plus current blacklist blob, if any

### `GET /api/user-blacklist`

Input:

```txt
Authorization: Bearer <token>
```

Server behavior:

- hash token and find wallet
- return blob for that wallet, or empty v1 blob
- use `Cache-Control: no-store`

### `PUT /api/user-blacklist`

Input:

```txt
Authorization: Bearer <token>
Content-Type: application/json
```

Body is the synced blob.

Server behavior:

- hash token and find wallet
- validate max body size, e.g. 16 KB or 32 KB
- validate schema, chain IDs, addresses, market IDs, and string lengths
- optional stale guard: reject if incoming `u` is older than stored `u - 5s`
- store blob under wallet key
- return saved blob

## Frontend plan

### 1. Shared sync module

Use:

```txt
app/lib/user-blacklist-sync.ts
```

Responsibilities:

- store/read sync token in localStorage, per wallet
- expose sync status with `useSyncExternalStore`
- convert local collateral exclusion records to/from blob `c`
- convert local lost-value market records to/from blob `w`
- enable sync by wallet signature
- fetch remote and merge into local
- push local state to backend

Suggested local keys:

```txt
user-blacklist-sync-token:v1:<wallet>
user-blacklist-sync-status:v1:<wallet>
```

### 2. Merge behavior

When enabling sync:

```txt
remote = GET token
local = list local collateral exclusions + lost-value markets
merged = union by chain/id, keeping newer per-entry timestamp
write merged to localStorage
PUT merged to backend
```

When a user adds/removes after sync is enabled:

```txt
apply local update immediately
serialize whole local user blacklist state
PUT to backend in background
```

If PUT fails, keep local state and show small non-blocking status in Advanced Settings. Do not block the user action.

### 3. Hook integration

Keep the current local modules as the UI source of truth. Add thin sync calls at mutation boundaries:

- after `setCollateralLocallyExcluded`
- after `clearCollateralLocallyExcluded`
- after `setMarketLocallyMarkedLostValue`
- after `clearMarketLocallyMarkedLostValue`

Implementation choice to avoid circular imports:

- either add optional `syncAfterUserBlacklistChange()` calls in UI handlers
- or add an event listener in `user-blacklist-sync.ts` that listens to existing local change events and debounces a backend push

Preferred: event listener + debounce, because it touches fewer call sites and automatically covers Blacklist Recap restores.

### 4. UI

Add to Advanced Settings:

```txt
Blacklist sync
Off: Save blacklist across this wallet's devices. Requires one wallet signature per device.
[Enable sync]

On: Synced for 0x1234...abcd. Last sync: <time/status>
[Sync now] [Disable on this device]
```

On first blacklist/lost-value action when sync is not enabled, use a small confirmation path:

```txt
Save blacklist across devices?
[Enable sync] [Keep local only]
```

If adding that prompt risks scope creep, skip it for v1 and only expose Advanced Settings migration. This is the smallest shippable version.

## Recommended v1 cut

To keep the feature tiny:

1. Implement Advanced Settings enable/migrate only.
2. Once enabled, sync all future local changes via debounced event listener.
3. Do not prompt on first blacklist action in v1.
4. Include both collateral blacklist and lost-value markets.
5. Do not include manual collateral decisions unless explicitly confirmed.
6. No token revocation UI; "Disable on this device" only deletes the local token.

## Checklist

- [ ] Add KV binding to `wrangler.toml` with placeholder IDs and deployment note
- [ ] Add `USER_BLACKLIST` type to `functions/env.d.ts`
- [ ] Add `functions/api/user-blacklist.ts` with POST/GET/PUT handlers
- [ ] Add validation helpers for compact blob shape
- [ ] Add frontend sync module and local token storage
- [ ] Add blob serialization/merge for local collateral exclusions
- [ ] Add blob serialization/merge for local lost-value market exclusions
- [ ] Add debounced background sync listener after sync is enabled
- [ ] Add Advanced Settings sync control
- [ ] Run `bun run typecheck`
- [ ] Run `bun run lint`
- [ ] Run `bun run build`

## Done criteria

- Existing local exclusion behavior still works with sync disabled
- Enabling sync requires one wallet signature on the device
- Existing local entries migrate to backend on enable
- Another device can enable sync for the same wallet and receive merged entries
- Future collateral blacklist and lost-value market changes sync silently
- Backend rejects invalid/oversized payloads
- Verification commands pass
