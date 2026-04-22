---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

Adds first-class machine selectors across core and React integrations.

- `@tdreyno/fizz`
	- Added `selectWhen(...)` for colocated machine selectors with typed state narrowing.
	- Added matcher shorthand support (`selectWhen(State, { key: value })`) for boolean checks over `state.data`.
	- Added `runStateSelector(...)` and `matchesSelectorWhen(...)` utilities to evaluate selectors outside React runtimes.
	- Added selector exports and selector-aware `createMachine(...)` typing so selectors can be defined on machine roots.
	- Function selectors return `undefined` when `currentState` does not match; matcher selectors return `false` when not matched.

- `@tdreyno/fizz-react`
	- `useMachine(...)` and `createMachineContext(...).useMachineContext()` now expose `machine.selectors` from machine-defined selectors.
	- Selector values recompute on context changes and support per-selector `equalityFn` reuse to avoid selected-value churn.
	- Added selector coverage in React integration tests for type behavior, context-provider usage, and equality handling.
