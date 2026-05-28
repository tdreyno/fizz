---
"@tdreyno/fizz": minor
---

Make DOM listener builders chain-first: `listen(...)` now accumulates listeners inside a `domChain` wrapper instead of exposing the legacy tuple-style listener payload.

Migration: update any code or tests that inspected the old listener array shape to read `data.acquire` and `data.listeners` on the returned `domChain` effect.
