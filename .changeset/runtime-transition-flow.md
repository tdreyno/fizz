---
"@tdreyno/fizz": minor
---

Add transition observation and flow-history introspection to the runtime.

`Runtime#onTransition(fn)` registers a subscriber that fires whenever the machine's state name changes, receiving `{ state, previousState, action }` where `action` is the triggering action (XState `state.event` parity). It returns an unsubscribe function. The existing `onContextChange(fn)` signature is unchanged and still fires on every context change.

`Runtime#lastAction()` returns the most recent triggering action (or `undefined` before the first action runs). `Runtime#getVisitedStateNames(options?)` returns the ordered (oldest → newest) composed state-path names from history, and `Runtime#getFlow(separator = ",")` joins them into a single flow string. Nested regions use the composed `getStatePath` form per visited state. The `RuntimeTransitionInfo` type is exported from the package root.
