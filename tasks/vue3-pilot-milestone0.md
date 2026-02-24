# Vue 3 Pilot - Milestone 0 (Wallet Stack Spike)

## Goal

Validate a Vue-native wallet stack that can replace RainbowKit-dependent UX for the pilot, using Bun runtime, before building broader Vue parity features.

## Scope

Implement a focused spike in `vue-app/` that proves:

- Wallet connect/disconnect works in Vue
- Chain detection and switch-chain flows are reliable
- Wrong-network warning behavior can match current app expectations
- The chosen stack typechecks and builds with Bun-based commands

## Recommended stack

- `@wagmi/vue`
- `wagmi`
- `viem`
- `@wagmi/connectors`
- Custom minimal wallet UI (no RainbowKit)

## Out of scope

- Home/optimizer/market feature parity
- Styling parity with the React app
- SSR
- New business logic for IRM/optimizer

## Implementation checklist

- [ ] **Scaffold and baseline**
  - [ ] Ensure `vue-app/` exists and runs with Bun.
  - [ ] Add/confirm scripts: `dev`, `typecheck`, `lint`, `build`.
  - [ ] Keep pilot isolated from existing React app runtime.

- [ ] **Install wallet/runtime dependencies**
  - [ ] Add `@wagmi/vue`, `wagmi`, `viem`, `@wagmi/connectors`.
  - [ ] Add/confirm `vue-router`, `pinia`, `@tanstack/vue-query`.

- [ ] **Port wagmi/viem config baseline**
  - [ ] Create `vue-app/src/lib/wagmi.ts`.
  - [ ] Port supported chains and transport strategy from `app/lib/wagmi.ts`.
  - [ ] Preserve fallback RPC ordering where practical.

- [ ] **Wire app providers and state**
  - [ ] Register wagmi Vue plugin in app entry.
  - [ ] Register Pinia and Vue Query providers.
  - [ ] Add `useNetworkStore` (Pinia) with `requiredChainId` and setter.

- [ ] **Build wallet spike route**
  - [ ] Add route `/wallet-spike`.
  - [ ] Add minimal controls: connect, disconnect, switch chain.
  - [ ] Show reactive status: `isConnected`, `address`, `chainId`.
  - [ ] Show wrong-network state derived from `requiredChainId`.
  - [ ] Surface connector/switch errors in UI (simple text is enough).

- [ ] **Add composable abstraction**
  - [ ] Create `vue-app/src/composables/useWallet.ts` wrapper.
  - [ ] Expose stable API: `isConnected`, `address`, `chainId`, `connect`, `disconnect`, `switchChain`.
  - [ ] Keep abstraction small and deterministic for later page integration.

- [ ] **Validation gates**
  - [ ] `bun run typecheck` passes in `vue-app/`.
  - [ ] `bun run build` passes in `vue-app/`.
  - [ ] Manual test: connect wallet succeeds.
  - [ ] Manual test: disconnect succeeds.
  - [ ] Manual test: switch to required chain succeeds when mismatched.
  - [ ] Manual test: wrong-network indicator toggles correctly.

## Pass/Fail decision

- [ ] **PASS**: all validation gates above pass; lock wallet stack as `@wagmi/vue` + custom wallet UI for pilot.
- [ ] **FAIL**: switching/connectors are unreliable; open fallback task for direct EIP-1193 + viem adapter while preserving the same store/composable API.

## Done criteria

- [ ] Checklist items above are complete.
- [ ] A human can run `vue-app/` and verify wallet flows from `/wallet-spike`.
- [ ] Decision is recorded: proceed with `@wagmi/vue` or trigger fallback task.
