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
- Wagmi Vue wallet baseline with injected connector
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
- The current wallet abstraction is intentionally thin for the spike; if the stack survives Milestone 0, the next pass should move page-facing wallet behavior behind a Pinia-first adapter
