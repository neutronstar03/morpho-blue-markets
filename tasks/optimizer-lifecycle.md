# Optimizer lifecycle (#7)

Goal: mount scan/manual query owners only in their visible scope and isolate freshness ticks.

- [x] Keep global datasets/analytics independent of the home scan.
- [x] Mount home scan only at `/`; its existing unmount cleanup retains opportunities.
- [x] Mount manual controller only while expanded; cancel an active run on collapse.
- [x] Keep saved inputs, selection and results in the persistent provider/local storage.
- [x] Move the five-second timer into MarketFreshnessLabel.
- [x] Verify query-owner counts with React Query and fake timers, and unchanged-row commits with React Profiler.
- [x] Pass types, lint, build and full UI suite (32 pass, 2 existing skips).

Before: the scan owner mounted on every route, the manual controller mounted while collapsed,
and each freshness tick rerendered AdvancedList. After: only the home route mounts scan hooks;
manual query ownership starts at expansion, stops on collapse, and is independent of the scan;
freshness state is local to the label. Tests use synthetic query owners, not a real connected wallet
or a production request/profile trace. On Carlino Node 26, UI checks need
`NODE_OPTIONS=--no-experimental-webstorage` to use JSDOM localStorage; project runtime is Node 20.
