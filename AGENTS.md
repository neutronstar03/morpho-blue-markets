# AGENTS.md (Agent Operator Manual)

Use this file to navigate the repo quickly, run the right commands, and avoid known footguns.

## Commands (copy/paste)
Runtime/toolchain: Node 20 + bun

- Install: bun install
- Dev: bun run dev
- Typecheck (fast): bun run typecheck
- Lint/format: bun run lint
- Build/release: bun run build

## Where to look first (common edits)
- UI routes/pages: app/pages/
- Data fetching + orchestration (RPC/GraphQL hooks): app/lib/hooks/
- IRM math (rates/curves, source of truth): app/lib/irm/
- Supply optimizer (APR outputs) logic + fixtures: app/lib/optimizer/
- Plans/checklists/work notes: tasks/

If you are unsure where a bug lives, start from the relevant file in `app/pages/` and trace imports into `app/lib/...`.

## Repo map (high-signal)
- app/pages/: UI routes and page components (start here for UI bugs)
- app/lib/hooks/: RPC + GraphQL hooks and business logic (data access + orchestration)
- app/lib/irm/: IRM math helpers (rates/curves)
- app/lib/optimizer/: supply optimizer logic and fixtures (APR outputs)
- tasks/: plans, checklists, work notes, history (prunable)

## Invariants / gotchas (keep these true)
- Market APY previews must use IRM math only; no coarse utilization estimates.
- If IRM data is missing, show "----" or an explicit error (do not fake a fallback).
- All Morpho markets use IRM; do not mention or implement non-IRM fallbacks in market preview logic.
- Supply optimizer outputs use APR (blendedAprWad/supplyAprAfterWad), not APY; keep labels and calculations on APR.

## Boundaries (do not do)
- Do not commit secrets or credentials.
- Do not edit generated outputs without a clear reason.
- Avoid lockfile churn unless required by a dependency change.

## Verification (before you say "done")
- bun run typecheck
- bun run lint
- bun run build (if change touches routing, bundling, or shared libs)

## Where things go
- README.md: what this project is + fastest way to run it.
- AGENTS.md: how to work in this repo (agent-facing, self-updating).
- tasks/: plans, checklists, work notes, history.
- docs/: durable documentation you intend to keep updated (optional).

## How to write tasks (when requested or work is multi-step)
- Every task file should have: goal, checklist, and "done" criteria in the checklist.
- If a task has no checklist, add a small one first (3-10 items).
- If the checklist is complete, the task is complete. Do not invent extra requirements.
- Keep tasks actionable; move long-lived knowledge to docs/.

## House rules
- Quote rule: use plain ASCII quotes only: 'single quotes' and "double quotes". Do not use "smart quotes".
