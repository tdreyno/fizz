---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

Add new runtime ergonomics and React subscription helpers.

For `@tdreyno/fizz`:
- Add test harness helpers: `settle(...)`, `waitForState(...)`, and `waitForOutput(...)` in `@tdreyno/fizz/test`.
- Extend `waitState(...)` timeout options with an object form (`{ delay, id? }`) for scheduler-driven timeout behavior while preserving numeric timeout compatibility.
- Export `WaitStateTimeout` from the package root.

For `@tdreyno/fizz-react`:
- Add `useMachineSubscription(...)` to simplify imperative runtime subscriptions with optional immediate replay via `{ emitCurrent: true }`.
- Ensure the helper works with both `useMachine(...)` and `createMachineContext(...).useMachineContext()` return values.
