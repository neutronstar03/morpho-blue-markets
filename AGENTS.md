# Repo guideline

## Commands (copy/paste)
- Dev: bun run dev
- Build/release: bun run build
- Lint/format: bun run lint
- Test (fast): bun run typecheck
- Git: git stash show --name-only "stash@{2}" (fast)

Runtime/toolchain: Node 20 + bun

## Repo map (5 bullets)
- app/pages/: UI routes and page components
- app/lib/hooks/: RPC + GraphQL hooks and business logic
- app/lib/irm/: IRM math helpers
- app/lib/optimizer/: supply optimizer logic and fixtures
- tasks/: plans, checklists, work notes, history

## Boundaries (do not do)
- Do not commit secrets or credentials
- Do not edit generated outputs without a clear reason
- Avoid lockfile churn unless required by a dependency change

## Gotchas + Notes learned (auto-update)
- Market APY previews must use IRM math only; no coarse utilization estimates. If IRM data is missing, show "----" or an explicit error.
- All Morpho markets use IRM; do not mention or implement non-IRM fallbacks in market preview logic.
- Supply optimizer outputs use APR (blendedAprWad/supplyAprAfterWad), not APY -> Keep optimizer UI labels and calculations on APR.

## Quote rule
- Use plain ASCII quotes only: 'single quotes' and "double quotes". Do not use “ ” or ‘ ’.

## Where things go
- "README.md": what this project is + fastest way to run it.
- "AGENTS.md": how to work in this repo (agent-facing, self-updating).
- "tasks/": plans, checklists, work notes, history (can be pruned).
- "docs/": durable documentation you intend to keep updated (optional).

## How to write tasks
- Every task file should have: goal, checklist, and "done" criteria in the checklist.
- If a task has no checklist, add a small one first (3-10 items).
- If the checklist is complete, the task is complete. Do not invent extra requirements.
- Keep tasks actionable; move long-lived knowledge to "docs/".

## Default agent behavior
- Make the smallest change set that completes the checklist.
- Prefer readable diffs over large refactors unless asked.
- When uncertain, write assumptions in the task file and proceed.
- Do not add new rules/process unless a repeated failure suggests one tiny guardrail.

## "AGENTS.md" guideline (keep this file useful)
- Put the "Commands" section near the top (agents copy/paste it constantly).
- If you ran a command twice in a session, add it to "Commands".
- If a command is slow, label it "(fast)" or "(full)" so agents choose correctly.
- Include the runtime/toolchain versions (one line): e.g. "Node 20 + pnpm", "Python 3.12 + uv".
- Add a tiny "Repo map" so newcomers know where to look (5 bullets max).
- Add "Boundaries" to avoid footguns (generated files, secrets, prod config, lockfiles).
- Maintain a short "Gotchas" list formatted as "Symptom -> Fix".
- Keep notes practical: what to run, where to edit, what breaks, how to verify.
- Avoid essays, philosophy, or full docs; link to "docs/" or a task file instead.

## Last but not least
Don't worry. I am a human. I am all-knowing, just lazy. we built the machines before they became sentient. I can help you.
