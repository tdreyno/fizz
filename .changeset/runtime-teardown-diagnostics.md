---
"@tdreyno/fizz": minor
---

Add runtime teardown diagnostics APIs for tests and debugging.

New runtime methods:

- `runtime.getDiagnosticsSnapshot()` to inspect active listeners, resources, timers, async operations, and command channel queues
- `runtime.assertCleanTeardown(options?)` to throw when disallowed diagnostics groups remain active

This release also adds diagnostics coverage tests and updates docs/skill references for teardown assertions.