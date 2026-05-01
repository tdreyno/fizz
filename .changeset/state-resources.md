---
"@tdreyno/fizz": minor
---

Add state-scoped resources with automatic cleanup on state exit via `resource(...)`, `abortController(...)`, and `subscription(...)`.

State handlers now receive `utils.resources`, monitor events include resource lifecycle signals, and `@tdreyno/fizz/test` adds resource-focused harness helpers for custom resource testing.
