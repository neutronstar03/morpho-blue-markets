# Agent Operator Manual
Use this file to navigate the repo quickly, run the right commands, and avoid known footguns.

Name of the project: MBM - Morpho Blue Markets

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

For more technical information, refer to the `AGENTS.technology.md` file.

## Boundaries (do not do)
- Do not commit secrets or credentials.
- Do not edit generated outputs without a clear reason.
- Avoid lockfile churn unless required by a dependency change.

## Verification (before you say "done")
- bun run typecheck
- bun run lint
- bun run build (if change touches routing, bundling, or shared libs)

## Release workflow
- Treat release prep as a repo workflow that updates `README.md`, `CHANGELOG.md`, and `package.json` together.
- Default to a patch bump; major/minor bumps should usually come from the user.
- Add the newest release entry at the top of `CHANGELOG.md` and the short recent-updates list in `README.md`.
- `README.md` should only recap last 3 releases, full changelog is in `CHANGELOG.md`.
- Re-run "Verification" step releasing
- Release commit format:
  - `v1.2.xx: short summary`
- Release tag format:
  - `v1.2.xx`
- When the user explicitly asks to do the release now, finish by creating the git commit, creating the matching tag, and pushing both the branch and the tag.

## Lint workflow
- If lint fails on import order / formatting / other autofixable issues, run `bun run lint --fix` instead of fixing them manually.
- Prefer autofix first; only make manual lint-only edits when autofix cannot resolve the issue.

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
- Quote rule: use plain ASCII quotes in code/docs ('single quotes' and "double quotes"); avoid "smart quotes".
