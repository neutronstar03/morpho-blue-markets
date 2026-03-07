# Vue Pilot

Milestone 0 validates the Vue-native wallet stack before any route or optimizer parity work.

## Commands

- Install: `bun install`
- Dev: `bun run dev`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- Build: `bun run build`

## Current scope

- Vite + Vue 3 + TypeScript app scaffold
- Vue Router, Pinia, and Vue Query providers
- Pinia-first wallet baseline backed by wagmi core
- `/wallet-spike` route for connect, disconnect, required-chain, and switch-chain checks

## Manual QA

Open `http://localhost:5173/wallet-spike` and verify:

- Connect succeeds with an injected wallet
- Disconnect succeeds
- Required chain selection toggles wrong-network state correctly
- Switch chain works when connected on the wrong chain
- Errors are surfaced as inline text when the wallet rejects an action

## Notes

- RPC ordering is intentionally copied from the React app baseline in `app/lib/wagmi.ts`
- The wallet page reads from a Pinia store; wagmi stays behind the store boundary so page components do not depend on wagmi composables directly
