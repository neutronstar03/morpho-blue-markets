# Proper Transaction Feedback Plan

## Goal

Add a unified v1 transaction feedback system so users can clearly understand when a transaction flow has started, what step it is on, whether it is waiting for wallet signature or onchain confirmation, and what exactly completed successfully.

This system should cover:

- Supply APR Optimizer execution
- Batch Withdraw execution
- Single-market deposit
- Single-market withdraw
- preparatory steps such as Morpho authorization, Permit2 approval, and Permit2 signature

The intended v1 UX is:

- one active tracked transaction flow at a time
- a fixed bottom-right dock on desktop / bottom full-width dock on mobile while work is in progress
- an automatic centered success recap modal when the flow completes
- full recap details by default

## Checklist

- [ ] Define shared transaction-feedback types for active flow, step state, success payload, and error payload
- [ ] Add a global transaction feedback provider and hook at app shell level
- [ ] Add a reusable transaction dock component for active/pending/confirming/error states
- [ ] Add a reusable centered success recap modal component
- [ ] Add helpers to publish/update/complete/fail a tracked transaction flow from any page or hook
- [ ] Refactor Supply Optimizer execution to report all steps through the shared system
- [ ] Refactor Batch Withdraw execution to report all steps through the shared system
- [ ] Integrate single-market deposit so approval and supply use the shared system
- [ ] Integrate single-market withdraw so withdraw uses the shared system
- [ ] Keep existing inline notices only as secondary/local guidance, not the primary status signal
- [ ] Add explorer link support where a tx hash exists
- [ ] Ensure success recap data is explicit and not inferred indirectly from button state
- [ ] Validate desktop and mobile behavior for dock placement and modal readability
- [ ] Run verification: `bun run typecheck`
- [ ] Run verification: `bun run lint`
- [ ] Run verification: `bun run build`

## File-by-File Plan

### 1. App shell / provider wiring

#### `app/lib/providers.tsx`

Add a new `TransactionFeedbackProvider` around the app so all pages and hooks can publish transaction lifecycle updates.

Planned change:

- import the new provider from `app/lib/contexts/transaction-feedback.context`
- wrap existing providers/children with it

#### `app/root.tsx`

Mount the new global UI surfaces so they exist once per app:

- `TransactionDock`
- `TransactionSuccessModal`

These should render near the existing `UpdateAvailableToast` so global overlays stay centralized.

### 2. New shared transaction-feedback state

#### `app/lib/contexts/transaction-feedback.context.tsx` (new)

Create the core provider/context for the feature.

Responsibilities:

- hold the single active transaction flow
- hold current lifecycle status
- hold current step list and active step
- hold tx hash when present
- hold success recap payload
- hold error payload
- expose actions such as:
  - `beginFlow(...)`
  - `setAwaitingWallet(...)`
  - `setSigning(...)`
  - `setSubmitted(...)`
  - `setConfirming(...)`
  - `completeFlow(...)`
  - `failFlow(...)`
  - `dismissSuccessModal()`
  - `resetFlow()`

Suggested shape:

- `kind`: `optimizer | batchWithdraw | deposit | withdraw | approval | authorization | permit2Sign`
- `status`: `idle | awaiting_wallet | signing | submitted | confirming | success | error`
- `title`
- `summary`
- `tokenSymbol`
- `amountDisplay`
- `txHash`
- `steps: Array<{ key, label, type, status }>`
- `successDetails`
- `errorMessage`

Important:

- v1 should support one active flow only
- prep steps should still appear inside that one flow as sub-steps
- success modal state should survive button rerenders and local form resets

#### `app/lib/contexts/transaction-feedback.types.ts` (new, optional)

If the context file grows too much, keep the type definitions in a dedicated file so UI components and feature pages can share the same contracts cleanly.

### 3. New global transaction UI components

#### `app/components/transaction/transaction-dock.tsx` (new)

Create the active transaction dock.

Desktop:

- fixed lower-right
- compact card

Mobile:

- fixed bottom full-width row/card

Should show:

- spinner / success / error icon
- action label, e.g. `Optimizing 12,540.32 USDC`
- current step label, e.g. `Waiting for wallet signature` / `Confirming onchain`
- optional tx hash explorer link
- dismiss button only when appropriate

#### `app/components/transaction/transaction-success-modal.tsx` (new)

Create the centered completion modal.

Should show:

- success headline
- total amount / token / action summary
- full detailed list by default
- explorer link when relevant
- close button

This modal should be flexible enough to render:

- optimizer recap with per-market changes
- batch withdraw recap with withdrawn markets
- single deposit recap
- single withdraw recap

#### `app/components/transaction/transaction-success-details.tsx` (new, optional)

If helpful, extract the detail rendering logic here so the modal stays small and the recap presentation can be specialized by flow kind.

### 4. Shared helpers / formatting

#### `app/lib/explorer.ts`

Likely reuse or extend existing explorer helpers so the dock/modal can deep-link tx hashes consistently.

#### `app/lib/formatters.ts`

If needed, add or reuse compact amount formatting helpers so dock copy remains consistent across optimizer, batch withdraw, deposit, and withdraw.

### 5. Supply Optimizer integration

#### `app/pages/home/bundle-optimizer-result.tsx`

This is the highest-priority integration.

Refactor from local-only button/receipt handling to the shared transaction feedback system.

Track the full step sequence:

1. authorize Morpho adapter
2. approve Permit2
3. sign Permit2
4. submit execute multicall
5. confirm transaction
6. show success recap modal

Implementation notes:

- publish a flow as soon as the user starts an action
- keep step labels explicit so the user knows whether the wallet is waiting for a signature or the chain is confirming a submitted tx
- on success, pass explicit recap data derived from `displayResult.positions`
- reuse the optimizer result table semantics in the success payload, but keep the modal rendering lighter than the full page table if needed

Suggested recap payload fields:

- optimized total amount
- token symbol/decimals
- affected markets list
- per-market current / target / delta
- wallet-in / wallet-out summary
- markets touched count

### 6. Batch Withdraw integration

#### `app/pages/home/batch-withdraw/index.tsx`

Refactor inline write/receipt lifecycle into the shared transaction feedback system.

Track:

1. authorize Morpho adapter if needed
2. submit bundle
3. confirm transaction
4. show success recap modal

Success recap should include:

- total withdrawn amount
- token symbol
- markets withdrawn from
- per-market planned withdraw amount / full exit state if relevant

#### `app/pages/home/batch-withdraw/execution-panel.tsx`

Keep this panel focused on execution CTA and local action availability, but remove the burden of being the main status surface.

Likely changes:

- simplify button copy because global dock will carry the richer progress language
- keep local simulation/setup errors visible
- avoid duplicating full success messaging here

#### `app/pages/home/batch-withdraw/shared.ts`

May need to extend local execution state types or add helper mappers so batch-withdraw plan data can be transformed cleanly into the global success recap payload.

### 7. Single-market transaction integration

#### `app/lib/hooks/rpc/use-morpho.ts`

This is the best shared hook layer for single-market actions.

Potential refactor:

- keep wagmi simulation/write logic here
- optionally add small callback hooks or returned metadata so forms can report lifecycle transitions into the global transaction provider

Possible additions:

- standardized action labels
- normalized tx metadata for approval/supply/withdraw
- optional callbacks for `onWriteRequested`, `onHash`, `onConfirmed`, `onError`

The goal is to avoid each form reinventing transaction lifecycle mapping.

#### `app/pages/market/components/deposit-form.tsx`

Integrate two possible tracked steps:

1. token approval when needed
2. supply transaction

Behavior:

- if approval is required, the global dock should explain that first
- after approval success, the form can still show its local yellow/green guidance, but the user should also get consistent global feedback
- when supply succeeds, open the success recap modal

Success recap can be simpler here:

- deposited amount
- token symbol
- market label
- chain / market link if useful

#### `app/pages/market/components/withdraw-form.tsx`

Integrate the shared flow for single-market withdraw.

Behavior:

- show dock on submit
- show confirmation progress with tx hash when available
- show centered success recap on confirmation

Success recap can include:

- withdrawn amount
- token symbol
- market label

### 8. Existing local status UI cleanup

#### `app/pages/market/components/market-action-form/status-message.tsx`

Keep inline notices and success cards if still useful, but reposition them as local secondary feedback.

Potential cleanup:

- continue to use `InlineNotice` for approval-needed / insufficient balance / liquidity warnings
- consider reducing or removing the full-page `SuccessMessage` return path once the global success modal becomes the main success pattern

#### `app/pages/market/components/market-action-form/submit-button.tsx`

Likely no major structural change, but button labels may be simplified because the dock will carry richer status copy.

### 9. Styling / UI primitives

#### `app/components/update-available-toast.tsx`

Use this as a layout/style reference for the dock.

Need to ensure the new dock and update toast do not overlap awkwardly. If necessary, reserve stacking space or slightly adjust one component's position.

#### `app/components/ui/button.tsx`

Only touch if the new dock/modal need a button variant not already present.

### 10. Validation / follow-up testing

#### affected flows to verify manually

- Optimizer path with all setup steps needed: authorize + Permit2 approve + sign + execute
- Optimizer path with setup already done: execute only
- Batch Withdraw path with authorization needed
- Batch Withdraw path with authorization already done
- Deposit path requiring approval
- Deposit path with approval already granted
- Withdraw path with sufficient liquidity
- Failure cases: rejected wallet signature, simulation error visible locally, onchain revert or receipt failure
- Mobile dock placement and modal readability

## Proposed Implementation Order

1. Add provider + types
2. Add dock + success modal
3. Wire provider/UI into root shell
4. Integrate optimizer flow first
5. Integrate batch withdraw second
6. Integrate deposit/withdraw third
7. Reduce duplicated local success messaging
8. Run typecheck/lint/build

## Risks / Watchouts

- Wallet signature and onchain confirmation are different states; the copy must make that distinction obvious
- Bundler flows include both signatures and transactions, so a sloppy model will confuse users
- Success recap data should be built from explicit inputs, not reverse-engineered from changed button labels or stale simulation state
- The single active flow rule means a new tracked action should either be blocked or intentionally replace/reset the previous completed one
- Global overlays need careful z-index and mobile spacing so they do not conflict with the footer or existing update toast

## Done Criteria

- A user starting optimizer execution immediately sees a global active transaction dock
- A user starting batch withdraw immediately sees a global active transaction dock
- A user starting deposit/withdraw on market pages immediately sees the same global active transaction dock
- The dock clearly distinguishes signature waiting, submission, and confirmation states
- The dock can show tx hash/explorer link when a transaction was submitted
- Successful completion automatically opens a centered recap modal
- The recap modal shows full details by default for optimizer and batch withdraw
- Existing inline notices remain useful for local warnings but are no longer the only way a user understands success/failure
- Full typecheck, lint, and build pass
