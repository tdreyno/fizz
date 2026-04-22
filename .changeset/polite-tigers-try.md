---
"@tdreyno/fizz": minor
---

Add retry and shared backoff policy support to existing async helpers.

`requestJSONAsync(...)` and `customJSONAsync(...)` now accept optional `init.retry` settings for attempts, retry predicates, and fixed or exponential backoff with optional jitter. `withRetry(...)` now uses the same shared retry policy shape, so fluent and root async retry behavior are consistent.
