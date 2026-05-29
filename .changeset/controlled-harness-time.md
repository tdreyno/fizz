---
"@tdreyno/fizz": minor
---

Add explicit controlled-time helpers to `@tdreyno/fizz/test` harnesses: `advanceTime(ms, options?)`, `advanceTimeTo(targetMs, options?)`, and `time.{advance,advanceTo,now,total}`.

`advanceBy(...)` and `runAllTimers()` are removed from the harness API in favor of the new time helpers.

Migration:

- Replace `harness.advanceBy(ms)` with `harness.advanceTime(ms)`
- Replace `harness.runAllTimers()` with `harness.settle()` or explicit `harness.advanceTime(...)` steps
