# Local Blacklist Entry Safety Plan

## Goal

Add a user-local blacklist mode for collateral assets that acts as a personal "never again" safety mechanism.

The behavior should be:

- a blacklisted collateral is not suggested in optimizer/discovery-style home surfaces
- a blacklisted collateral still appears in Positions if the user already has exposure
- a blacklisted collateral still appears in Batch Withdraw so the user can exit
- the direct market page remains reachable and usable
- no extra logic is added to block manual deposit on the market page

## Checklist

- [ ] Confirm and document the new blacklist semantics in code comments and task notes: blacklist means "do not suggest / do not promote for re-entry", not "hide everywhere"
- [ ] Add a dedicated local-storage backed store for user blacklisted collateral assets, keyed by `chainId + collateralAddress`
- [ ] Expose read/write/remove helpers and a version/subscription hook so React surfaces update immediately when the blacklist changes
- [ ] Add a small market-page control to blacklist/unblacklist the current collateral asset, reusing existing button/badge styling where possible
- [ ] Show local blacklist state on the market page with clear wording such as "Locally blacklisted" or "Never suggest again"
- [ ] Update home optimizer candidate selection so blacklisted collateral markets are excluded from new-entry suggestions
- [ ] Update background optimizer scan logic so blacklisted collateral markets are excluded from suggested opportunities there as well
- [ ] Update home advanced/discovery market list so blacklisted collateral markets are hidden from that list
- [ ] Keep Positions visible even when a market's collateral is blacklisted locally
- [ ] Keep Batch Withdraw visible and functional even when a market's collateral is blacklisted locally
- [ ] Keep direct market fetch/page access working even when the collateral is blacklisted locally
- [ ] Make sure existing shared/system blacklist behavior is not accidentally widened further while implementing the new local blacklist
- [ ] If needed, refactor any current blacklist filtering that incorrectly removes open positions or exit paths from the UI
- [ ] Run verification: `bun run typecheck`
- [ ] Run verification: `bun run lint`
- [ ] Run verification: `bun run build` because this touches shared libs, routing-adjacent behavior, and multiple pages

## Proposed Implementation Notes

### 1. Separate the concerns clearly

Create a dedicated local blacklist module instead of reusing the existing hard blacklist fetch/cache module directly.

Reason:

- the existing blacklist utilities are currently used deep inside fetch/filter hooks
- those deep filters are appropriate for global dataset hygiene, but not for a user-local "never suggest again" preference
- the new feature should be applied at the surface-selection layer, not blindly in every data hook

Suggested file:

- `app/lib/local-collateral-blacklist.ts`

Suggested API:

- `isCollateralLocallyBlacklisted(chainId, collateralAddress)`
- `setCollateralLocallyBlacklisted(chainId, collateralAddress)`
- `clearCollateralLocallyBlacklisted(chainId, collateralAddress)`
- `useLocalCollateralBlacklistVersion()`
- optional helper: `filterLocallyBlacklistedCollaterals(...)`

Suggested storage shape:

- localStorage key prefix like `local-collateral-blacklist:v1:`
- one entry per `chainId:collateralAddress`
- or a single map blob if that proves simpler to manage consistently

### 2. Market page becomes the control surface

Add a lightweight advanced/safety UI on the market page so the user can mark the current collateral as "never suggest again".

Likely touch points:

- `app/pages/market/components/market-header.tsx`
- or a small new component near `app/pages/market/market-display.tsx`

UX goals:

- easy to discover but not noisy
- explicit wording that this is a local preference
- must not imply the market becomes inaccessible

### 3. Apply blacklist only to entry/suggestion surfaces

Primary surfaces to update:

- `app/pages/home/supply-apr-optimizer.tsx`
- `app/lib/hooks/use-home-magic-optimizer-scan.ts`
- `app/pages/home/advanced-list/index.tsx`

Behavior:

- exclude locally blacklisted collateral markets from candidate pools and suggested opportunities
- keep existing open positions available in exit-oriented surfaces

### 4. Preserve exit visibility

Do not use the local blacklist to hide or strip data from:

- `app/pages/home/position.tsx`
- `app/pages/home/batch-withdraw/index.tsx`
- `app/lib/hooks/rpc/use-live-market-positions.ts`
- direct market page load path in `app/routes/market.tsx` / `app/lib/hooks/graphql/use-market.ts`

If current filtering logic conflicts with this goal, refactor that logic so blacklisted exposure stays visible until fully exited.

### 5. Optional cleanup / semantic alignment

While implementing, inspect whether the current shared blacklist behavior is too aggressive for positions and exit paths.

If the implementation naturally exposes a clean fix, align the behavior so:

- blacklisted markets are hidden from discovery and optimizer flows
- blacklisted markets remain visible in positions and exit flows

Keep this tightly scoped to avoid changing unrelated behavior without verification.

## Risks / Watchouts

- The existing blacklist code is used in multiple shared hooks; changing it directly can create broad side effects
- Positions and Batch Withdraw currently depend on data paths that may already filter too early
- The market page must not regress into "Market not found" for a still-held blacklisted market
- The optimizer has several candidate-building paths, so blacklist logic must be applied consistently in all of them
- Since this is localStorage-driven UI state, versioning and event/subscription behavior must be consistent across rerenders and tabs

## Done Criteria

- A user can blacklist a collateral from the market page and that choice persists in localStorage
- The blacklisted collateral stops appearing in optimizer/discovery suggestions on home
- Existing positions on that collateral still appear in Positions
- Existing positions on that collateral still appear in Batch Withdraw
- The user can still open the market page for such a market
- Full typecheck, lint, and build pass
