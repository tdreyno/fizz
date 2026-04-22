---
"@tdreyno/fizz": minor
---

Require both `resolve` and `reject` handlers for async action mapping.

This is a breaking API change: `startAsync(...)` now requires both handler callbacks, and JSON builder `chainToAction(...)` calls must provide both resolve and reject mappers. Use explicit no-op handlers when a branch should ignore one side of the async result.