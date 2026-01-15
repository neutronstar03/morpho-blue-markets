# Plan: Move size heuristic for supply optimizer

## Goals
- Add a move-size heuristic layer that finds the minimal step size which completes under the optimizer iteration cap.
- Support an Auto mode in the UI when the input is empty.
- Cache Auto step size decisions for deterministic inputs.
- Display the chosen Auto step size near the total allocated summary.

## Implementation plan
1. Add `app/lib/optimizer/move-size-heuristic.ts` with:
   - 10x probe ladder starting from 0.001% of total position.
   - Cap at a configurable max percentage.
   - Binary refinement between the last failing and first passing step.
   - Return the smallest passing `stepAssets` plus attempts.
2. Update `SupplyApyOptimizer` to:
   - Treat empty minimum move size as Auto (placeholder text).
   - Use cached Auto step size if available.
   - Run heuristic when no cache entry exists or cached step fails.
   - Display the chosen Auto step size next to Total allocated.
3. Ensure Auto mode is deterministic and cleared when inputs or selection change.

# Task: Move size heuristic improvements

## Assumptions
- Tests should be deterministic and not use live RPC.
- UI should show Auto step attempts in a compact way.

## Checklist
- [x] Add deterministic snapshot fixture for optimizer tests.
- [x] Add heuristic test that asserts the chosen step size.
- [x] Keep cached-step fallback in the optimizer wrapper.
- [x] Display Auto step attempts next to the Auto step summary.
