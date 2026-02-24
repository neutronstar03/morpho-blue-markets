# Vue 3 Pilot

## Goal

Build a Vue 3 pilot in a separate branch that reproduces the core home/optimizer UX with equivalent business behavior, so a human can validate code quality and UI fidelity before deciding whether to migrate beyond the pilot.

## Non-goals

- Do not replace the existing React app in this pilot.
- Do not add SSR unless explicitly required later.
- Do not change IRM/optimizer business rules for convenience.

## Scope

Implement a parallel Vue app under `vue-app/` with:

- App shell and routing
- Home page equivalent
- One market detail page equivalent
- Wallet/network flow
- Optimizer flow (worker-based run, progress, cancel)
- Home magic optimizer scan (worker-based non-blocking compute)

## Proposed Stack (boring and strong)

- `vue@3` + `typescript` + `vite`
- `vue-router`
- `pinia` (shared state)
- `@tanstack/vue-query` (data cache/fetch orchestration)
- `wagmi` + `viem` for EVM reads/writes
- `tailwindcss` (match existing utility styling approach)

## Invariants to preserve

- Market APY previews must use IRM math only.
- If IRM data is missing, show `----` or explicit error; no fake fallback.
- All Morpho markets use IRM; do not implement non-IRM preview fallback.
- Supply optimizer outputs are APR (`blendedAprWad` / `supplyAprAfterWad`), not APY.

## Implementation checklist

- [ ] **Bootstrap pilot app**
  - [ ] Create `vue-app/` using Vite Vue + TS template.
  - [ ] Add base scripts for dev/typecheck/lint/build.
  - [ ] Add Tailwind setup and shared base styles.

- [ ] **Set up platform foundations**
  - [ ] Configure Vue Router with `home` and `market` routes.
  - [ ] Configure Pinia and mount at app entry.
  - [ ] Configure Vue Query provider and query client defaults.
  - [ ] Wire wagmi/viem config and wallet connect UI equivalent.

- [ ] **Port shared business logic safely**
  - [ ] Reuse or port optimizer, IRM, and helper modules without changing math.
  - [ ] Add worker protocol/types for optimizer compute in Vue pilot.
  - [ ] Ensure worker throttled progress updates remain sensible (about 200ms).

- [ ] **Implement global/shared stores (Pinia)**
  - [ ] `useNetworkStore` replaces `NetworkContext` behavior.
  - [ ] `useSupplyAprOptimizerStore` replaces optimizer context state/actions.
  - [ ] `useBatchWithdrawStore` replaces batch-withdraw context state/actions.
  - [ ] Keep APIs explicit and deterministic (start/clear/beginRun/cancel/finish).

- [ ] **Build Home page parity**
  - [ ] Header + network switch warning behavior.
  - [ ] Home sections for position, batch withdraw, supply optimizer, advanced list.
  - [ ] Home magic opportunities panel behavior.
  - [ ] Preserve existing UX expectations where practical.

- [ ] **Build Supply APR Optimizer parity**
  - [ ] Selection and inputs flow mirrors React behavior.
  - [ ] One optimize button UX: normal when idle, disabled + spinner when running.
  - [ ] Progress text shown in optimize button while running.
  - [ ] Header clear button becomes cancel (red) while active run.
  - [ ] Correct stale run protection and cleanup/terminate worker on cancel/unmount.

- [ ] **Build Home Magic scan parity**
  - [ ] Worker-driven scan execution (non-blocking main thread).
  - [ ] No extra progress UI required beyond current behavior.
  - [ ] Precompute/preset and dismiss flows behave equivalently.

- [ ] **Build Market page parity**
  - [ ] Route params (`chainId`, `uniqueKey`) handling.
  - [ ] Set/clear required chain behavior.
  - [ ] Market loading/error/not-found states.

- [ ] **Validation and quality gates**
  - [ ] Typecheck passes.
  - [ ] Lint passes.
  - [ ] Build passes.
  - [ ] Manual wallet/network sanity test passes.
  - [ ] Manual optimizer run/cancel/progress sanity test passes.

- [ ] **Docs and handoff**
  - [ ] Add `vue-app/README.md` runbook with commands and architecture notes.
  - [ ] Add migration notes: what matched, what differs, known gaps.
  - [ ] Add explicit human QA checklist for final validation.

## Suggested file layout

```text
vue-app/
  src/
    app/
      router/
    components/
    composables/
    pages/
    stores/
    lib/
      optimizer/
      irm/
      hooks/
```

## Human QA checklist (final gate)

- [ ] Home route loads and wallet connect works.
- [ ] Wrong-network prompt appears only when expected.
- [ ] Optimizer can run from idle state with realistic inputs.
- [ ] Cancel stops active optimizer run and returns UI to idle.
- [ ] Result table values and labels are APR-oriented and coherent.
- [ ] Home magic suggestion can open optimizer with preset values.
- [ ] Market route sets required chain and cleans up on exit.
- [ ] No severe console errors during common flows.

## Done criteria

- [ ] All checklist items above are complete.
- [ ] Pilot is isolated on branch `vue3-pilot` and does not break existing React app.
- [ ] A human can run, inspect, and compare the pilot against current behavior.
- [ ] Decision-ready notes exist (continue migration vs stop after pilot).
