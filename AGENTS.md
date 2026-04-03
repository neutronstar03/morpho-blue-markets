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
- Keep `public/blacklist.markets.json` generator-shaped (`{ chainId, uniqueKey }` only); do not add manual notes there.
- For manual/shady entries with context, prefer `app/lib/blacklist.assets.json` and use the `comment` field.

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
- Re-run verification before releasing:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run build`
- Release commit format:
  - `v1.2.xx: short summary`
- Release tag format:
  - `v1.2.xx`
- When the user explicitly asks to do the release now, finish by creating the git commit, creating the matching tag, and pushing both the branch and the tag.

## Lint workflow
- If lint fails on import order / formatting / other autofixable issues, run `bun run lint --fix` instead of fixing them manually.
- Prefer autofix first; only make manual lint-only edits when autofix cannot resolve the issue.

## Debugging (UI via MCP DevTools)

When debugging the Supply APR optimizer UI, use stable `data-testid` hooks:

- Form container: `data-testid="supply-apr-optimizer-form"`
- Result table: `data-testid="supply-apr-optimizer-result-table"`

Reusable DevTools snippet to dump result-table rows (run in the selected `localhost:5173` tab):

```js
(() => {
  const table = document.querySelector('[data-testid="supply-apr-optimizer-result-table"]')
  if (!table)
    return { found: false }
  const headers = [...table.querySelectorAll('thead th')].map(th => (th.textContent || '').trim())
  const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim())
    const marketLink = tr.querySelector('td a[href^="/market/"]')
    return {
      market: cells[0],
      current: cells[1],
      target: cells[2],
      delta: cells[3],
      aprAfter: cells[4],
      yearlyReturn: cells[5],
      href: marketLink ? marketLink.getAttribute('href') : undefined,
    }
  })
  return { found: true, capturedAt: new Date().toISOString(), headers, rowCount: rows.length, rows }
})()
```

Notes/pitfalls seen in practice:

- `maxMarketsUsed` + greedy step scoring can cause "slot stealing": a market that looks good for a tiny first step can consume the last available slot and then collapse at size, blocking better scalable markets.
- Relative gating (`newMarketHysteresisAprWad`) helps reduce churn in rebalance-only runs; deposit runs can set it to 0 to allow opening new markets.
- Auto move size should target a fixed iteration budget (e.g. 300), not the smallest step that merely stays under the iteration cap.

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
