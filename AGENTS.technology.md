## Repo map (high-signal)
- app/pages/: UI routes and page components (start here for UI bugs)
- app/lib/hooks/: RPC + GraphQL hooks and business logic (data access + orchestration)
- app/lib/irm/: IRM math helpers (rates/curves)
- app/lib/optimizer/: supply optimizer logic and fixtures (APR outputs)
  - `supply-optimizer.ts`: Max Yield optimizer (original, maximize total portfolio yield)
  - `supply-optimizer-max-deploy.ts`: Max Deploy optimizer (hold positions above base rate, maximize capital deployed)
  - `supply-optimizer-runner.ts`: Runner that selects optimizer by strategy and handles auto step-size
  - `supply-optimizer-worker.ts`: Web Worker wrapper
  - `supply-optimizer-worker-types.ts`: Worker message protocol (includes `strategy` field)
  - `move-size-heuristic.ts`: Binary search for optimal step size (respects strategy)
  - `supply-optimizer-ui-utils.ts`: Formatters and cache key builder (includes strategy in key)
- app/lib/contexts/optimizer.context.tsx: React context with strategy state (maxYield/maxDeploy)
- tasks/: plans, checklists, work notes, history (prunable)

## Invariants / gotchas (keep these true)
- Market APY previews must use IRM math only; no coarse utilization estimates.
- If IRM data is missing, show "----" or an explicit error (do not fake a fallback).
- All Morpho markets use IRM.
- Supply optimizer outputs use APR (blendedAprWad/supplyAprAfterWad), not APY; keep labels and calculations on APR.
- The optimizer has two strategies ('maxYield' and 'maxDeploy'):
  - Max Yield: maximize total portfolio APR, freely rebalancing across markets.
  - Max Deploy: hold positions whose APR >= base rate, only withdraw from markets below base rate.
  - Strategy is stored in `optimizer.context.tsx` (`inputs.strategy`) and passed through the worker.
  - The `holdAboveAprWad` constraint in `SupplyOptimizerConstraints` controls hold behavior for max-deploy.
  - Both strategies share the same greedy step-by-step loop and scoring; the difference is in minFinal initialization.
- Keep `public/blacklist.markets.json` generator-shaped (`{ chainId, uniqueKey }` only); do not add manual notes there.
- For manual/shady entries with context, prefer `app/lib/blacklist.assets.json` and use the `comment` field.

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
