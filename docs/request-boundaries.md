# Request and response boundaries

GraphQL HTTP attempts use one 15-second deadline, covering headers and body. The
React Query hook owns retries (at most two retries); fetchWithDeadline never retries.
Cancellation is propagated on wallet/chain changes. Abort, GraphQL validation and
local contract failures do not retry; transient transport/408/429/5xx failures use
bounded backoff. Retry-After is honored up to one minute; longer requests suppress
an automatic retry rather than retrying before the server-provided time.

Shared boundary parsers validate market list/detail, optimizer discovery and direct/
Vault V2 position discovery from unknown input before trusted DTOs enter business logic.
The existing popular-assets parser is now used by both browser direct/edge paths.
Missing/malformed objects, addresses, decimals, quantities or finite rates are errors,
not successful empty arrays. Explicit missing resources (null market/user, unavailable
oracle metadata, nullable prices) remain distinct product states. Unavailable oracle
resources are not supplied with an invented usable address. Incomplete pricing/APR
withholds complete portfolio totals; failed discovery/reads withhold complete plans.

A live 2026-11-05 probe confirmed Morpho BigInt scalars use safe JSON integer numbers
and strings for large values (91 safe numbers / 109 strings across 200 observed fields).
Both wire representations normalize to exact integer strings. Unsafe JS numbers,
fractional values and malformed quantities are rejected rather than rounded.

Live public-market list/detail/optimizer parser probes passed; no wallet was used.
Regression checks cover later-page failures, cancellations, deadline body reads, exact
attempt counts, malformed contracts, nullable resources and edge liquidity failures.
A GeckoTerminal transport/rate-limit failure now returns an error instead of caching
an unavailable-liquidity result; confirmed 404/no-liquidity remains nullable.
