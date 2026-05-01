---
"@tdreyno/fizz": minor
---

Add `createRuntimeRegistry(...)` for keyed runtime reuse and explicit disposal in non-React integrations.

The utility supports primitive and object keys, optional lifecycle events, configurable disposal failure policy, and deterministic `disposeAll()` behavior.