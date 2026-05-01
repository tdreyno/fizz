---
"@tdreyno/fizz": minor
---

Add `effectBatch(...)` for ordered imperative command batching.

- Supports optional `channel` for same-channel serialization.
- Supports optional `onError` with default `"failBatch"`.
- Supports both `chainToAction(...)` and `chainToOutput(...)` for batch completion/failure signaling.
