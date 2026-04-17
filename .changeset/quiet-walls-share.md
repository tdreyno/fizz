---
"@tdreyno/fizz": major
"@tdreyno/fizz-react": minor
---

Introduce a new public state-identity API on runtime states: `currentState.is(machine.states.SomeState)`.

For `@tdreyno/fizz`:
- Added `currentState.is(...)` on state transitions.
- Removed the `isState(...)` export from the package root.
- Removed `currentState.state` from the public `StateTransition` interface.

For `@tdreyno/fizz-react`:
- Hook/context values now expose `states`, so UI code can compare identity with `machine.currentState.is(machine.states.SomeState)`.

Migration notes:
- Replace `isState(currentState, SomeState)` with `currentState.is(SomeState)`.
- Replace `currentState.state === SomeState` with `currentState.is(SomeState)`.
