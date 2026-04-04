# Chained Transaction Dock Flow Plan

## Goal

Upgrade the current transaction-feedback feature from a set of separate per-step flows into a single chained execution flow.

The target UX is:

- one component-level CTA per action surface
- one Transaction Dock flow per user intent
- automatic progression through required prerequisites
- explicit step-by-step status in the dock
- one final success recap at the end

Important constraint:

- this is one unified UI flow, not one blockchain action
- the wallet may still prompt multiple times because approvals, signatures, and final execution are distinct actions

## Primary Surfaces In Scope

### 1. Supply APR optimizer bundle execution

File:

- `app/pages/home/bundle-optimizer-result.tsx`

Current prerequisite/action set:

- Morpho adapter authorization
- Permit2 token approval
- Permit2 signature
- optimizer bundle execution

Target UX:

- replace the separate setup buttons with one primary execute button
- pressing the button creates one dock flow and automatically advances through whichever prerequisites are still needed

### 2. Batch withdraw

Files:

- `app/pages/home/batch-withdraw/index.tsx`
- `app/pages/home/batch-withdraw/execution-panel.tsx`

Current prerequisite/action set:

- Morpho adapter authorization
- batch withdraw bundle execution

Target UX:

- one execute button
- one dock flow
- auto-authorize if needed, then execute

### 3. Single-market deposit

File:

- `app/pages/market/components/deposit-form.tsx`

Current prerequisite/action set:

- ERC20 approval when needed
- supply tx

Target UX:

- one submit button
- one dock flow
- auto-approve then auto-deposit when possible

### 4. Single-market withdraw

File:

- `app/pages/market/components/withdraw-form.tsx`

Current state:

- already effectively single-step

Target UX:

- likely keep as-is except align the flow model with the new shared runner if that reduces duplication

## Out of Scope

- changing the underlying bundler semantics
- merging approval + signature + execution into a single onchain transaction
- supporting multiple simultaneous active dock flows in this iteration

## Checklist

- [ ] Define the chained-flow UX rules and step semantics in shared types
- [ ] Extend the transaction-feedback model so one flow can represent multiple sequential actions cleanly
- [ ] Add a reusable orchestration layer for multi-step wallet/signature/tx execution
- [ ] Refactor optimizer execution to use one chained flow and one primary CTA
- [ ] Refactor batch withdraw execution to use one chained flow and one primary CTA
- [ ] Refactor deposit form so approval + supply can run as one chained flow
- [ ] Keep withdraw compatible with the new shared flow model without unnecessary UX churn
- [ ] Preserve existing success recap payload quality for optimizer and batch withdraw
- [ ] Ensure errors stop the chain immediately and mark the failing step clearly
- [ ] Ensure prerequisite reads are refreshed between steps so the next step gates correctly
- [ ] Ensure only one active attempt is tracked per surface while a chain is running
- [ ] Run verification: `bun run typecheck`
- [ ] Run verification: `bun run lint`
- [ ] Run verification: `bun run build`

## Proposed Architecture

### 1. Keep Transaction Dock global, but make flows chain-aware

Existing files:

- `app/lib/contexts/transaction-feedback.types.ts`
- `app/lib/contexts/transaction-feedback.context.tsx`
- `app/components/transaction/transaction-dock.tsx`

Keep the current single-active-flow model, but make each flow represent an entire user intent rather than one sub-action.

Recommended additions:

- step metadata that distinguishes:
  - wallet tx confirmation
  - signature request
  - onchain confirmation
  - completed prerequisite
- optional current-step summary override so the dock can say things like:
  - `Waiting for Permit2 approval in wallet`
  - `Confirming adapter authorization onchain`
  - `Waiting for Permit2 signature`
  - `Submitting optimizer bundle`

Prefer not to create a second dock abstraction. The current provider is already the right global home.

### 2. Add a reusable chained runner hook/helper

Recommended new file:

- `app/lib/transactions/use-chained-transaction-flow.ts`

Purpose:

- centralize the orchestration logic that today is duplicated across optimizer, batch withdraw, and deposit

Suggested responsibilities:

- start one flow with a full planned step list
- activate the next step
- invoke a step handler
- wait for tx hash when the step is an onchain action
- wait for receipt confirmation when needed
- support pure signature steps with no tx hash
- stop immediately on failure
- finalize with one success payload

Suggested conceptual step model:

```ts
interface ChainedFlowStep {
  key: string
  label: string
  kind: 'wallet_tx' | 'signature' | 'wait_tx' | 'informational'
  run: () => Promise<ChainedStepResult>
}
```

The implementation does not need to match this exact shape, but it should let each feature define a dynamic plan and then execute it with shared behavior.

### 3. Make plans dynamic, not hardcoded

Each surface should compute the required sequence from current reads.

Examples:

- Optimizer:
  - skip `authorize` if already authorized
  - skip `approvePermit2` if allowance is already sufficient
  - skip `signPermit2` if no wallet deposit is needed
- Batch withdraw:
  - skip `authorize` if already authorized
- Deposit:
  - skip `approve` if allowance is already sufficient

This means the runner should execute a step plan built from current derived state, not a fixed global script.

## Surface-by-Surface Plan

### 1. Optimizer first

File:

- `app/pages/home/bundle-optimizer-result.tsx`

This is the best pilot because it already contains all the complexity:

- authorization
- approval
- signature
- execution
- success recap details

Planned refactor:

- replace separate `onAuthorizeAdapter`, `onApprovePermit2`, `onSignPermit2`, and `onExecuteBundle` user flows with one `onStartExecutionFlow`
- keep internal low-level helpers for each action, but stop treating them as user-facing standalone flows
- compute `requiredSteps` from:
  - `isMorphoAuthorized`
  - `needsPermit2TokenApprove`
  - `permit2ToSign`
  - `multicallSim.data?.request`
- launch one dock flow with labels like:
  1. authorize adapter
  2. approve Permit2
  3. sign Permit2
  4. execute optimizer bundle
  5. confirm bundle onchain

Implementation note:

- preserve the existing `frozenNowSec` behavior so Permit2 typed data remains stable throughout the chain
- after every successful tx step, refetch gating reads before advancing
- rebuild bundle inputs only after prerequisite state updates are available

### 2. Batch withdraw second

Files:

- `app/pages/home/batch-withdraw/index.tsx`
- `app/pages/home/batch-withdraw/execution-panel.tsx`

Planned refactor:

- replace separate authorize/execute button logic with one start-flow handler
- keep local simulation/setup errors in the panel
- let the dock become the canonical status surface

Expected step list:

1. authorize adapter (optional)
2. execute withdraw bundle
3. confirm bundle onchain

### 3. Deposit third

File:

- `app/pages/market/components/deposit-form.tsx`

Planned refactor:

- preserve the single submit button, but change behavior from:
  - click once to approve
  - wait
  - click again to deposit

  to:

  - click once
  - approve if needed
  - refetch allowance
  - automatically submit deposit

Expected step list:

1. approve token (optional)
2. submit deposit
3. confirm deposit onchain

Important note:

- keep preview behavior unchanged
- do not auto-deposit unless the post-approval simulation says the deposit request is actually ready

### 4. Withdraw last / optional cleanup

File:

- `app/pages/market/components/withdraw-form.tsx`

Likely minimal changes:

- align local flow wiring with shared helper patterns if useful
- do not force a large refactor just to match the others if withdraw stays single-step

## UX Rules

- one prominent action button per surface
- the button should describe the final intent, not the next prerequisite
- the dock should describe the current prerequisite/action explicitly
- the user should never need to guess which setup button to press next
- if a chain stops on step N, the dock should remain open with the failed step highlighted
- success modal should appear only once, after the final user intent completes

## Error Handling Rules

- if the user rejects any wallet prompt, fail the current flow and mark that exact step as errored
- if a tx submits but confirmation fails, keep the tx hash and show confirmation failure
- if a prerequisite completes but the next simulation is still unavailable after refetch, fail with a clear gating message rather than hanging silently
- if the component rerenders while a flow is active, preserve the active flow state and avoid double-submitting the next step

## Data Refresh / Synchronization Rules

- after adapter authorization success, refetch authorization state before moving on
- after Permit2 approval success, refetch token allowance before moving on
- after any tx that changes bundle gating, refetch the relevant reads before recomputing the next step
- only advance once the next step is actually ready, not merely expected to be ready

## Risks / Watchouts

- `useWriteContract` and receipt tracking are currently surface-local; a chained runner must avoid stale `txHash` races
- optimizer execution uses derived bundle state and Permit2 signature state; sequencing bugs here can create mismatched bundle/sig data
- the current transaction-feedback context stores one `txHash`; decide whether that should remain the final executable tx hash or be updated per step during the chain
- React rerenders can retrigger effects if the orchestration state machine is not explicit
- deposit auto-chaining must not accidentally submit twice after approval refetch completes

## Recommended Rollout Order

1. Optimizer chained flow
2. Batch withdraw chained flow
3. Deposit chained flow
4. Withdraw cleanup only if it reduces duplication cleanly

This order gives the highest UX win first and de-risks the shared helper before applying it to simpler forms.

## Done Criteria

- Optimizer execution works from one primary button and one dock flow
- Batch withdraw works from one primary button and one dock flow
- Deposit can auto-approve then auto-deposit from one submit action
- The dock shows the active prerequisite/action step clearly throughout the chain
- Failures stop the chain at the correct step with a useful message
- Exactly one final success recap is shown per completed user intent
- Typecheck, lint, and build all pass
