# Commenting
This document is an audit checklist. When asked to "improve", "apply", or "check AGENTS.form.md against staged changes", do NOT rewrite this document. Instead, review every changed file against the rules below and flag (or add) any missing comments. The document itself is the stable standard; the code gets the comments.

The rule: comment only where a future reader would stop and wonder "why?" or "what is this doing?" — and the answer isn't obvious from the code itself.
Concretely that means:
1. One top-of-file sentence per file — what the hook orchestrates end-to-end, so you know the purpose before scrolling.
2. Non-obvious "why" — side effects whose motivation is invisible (clearing state on chain change, freezing a timestamp for Permit2, void'ing version hooks to trick reactivity, no-benefit suppression of display results, a 5-pass dust allocator, USDT's non-standard approve). The "what" is readable; the "why" isn't.
3. Async multi-step flows — a one-liner summarizing the step sequence before the big useCallback, because you can't infer the choreography from the control flow alone.
4. Nothing else — no section banners, no restating-what-the-code-does, no per-property docs. If you can read the name and see the logic, it earns its silence.
