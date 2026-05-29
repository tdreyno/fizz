---
"@tdreyno/fizz": minor
---

Add async introspection and flush APIs to the runtime and test harness.

New runtime methods:

- `hasPendingAsync(asyncId)` returns whether an operation is debouncing or in-flight for the id
- `getPendingAsync(asyncId)` returns a `{ asyncId, phase }` snapshot (`"debouncing"` or `"in-flight"`) or `undefined`
- `getPendingAsyncCount()` returns the number of pending operations across all ids
- `flushAsync(asyncId, options?)` fires a pending debounce immediately (or awaits in-flight work) and resolves a `FlushAsyncOutcome` (`nothing` | `succeeded` | `failed` | `aborted`); an optional `timeoutMs` resolves `{ type: "aborted" }` and cancels the operation if it does not settle in time

The `@tdreyno/fizz/test` harness exposes the same `hasPendingAsync`, `getPendingAsync`, and `getPendingAsyncCount` helpers, plus an overloaded `flushAsync(asyncId, options?)` that returns the outcome (the existing no-argument `flushAsync()` driver flush is unchanged).

Starting `startAsync(...)` with an explicit `asyncId` now cancels any pending debounce timer for that same id, enforcing single-owner exclusivity per `asyncId`.
