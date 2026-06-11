---
"@tdreyno/fizz-react": minor
---

Add the `useTransition(machine, listener)` hook for observing state transitions.

The listener receives `{ state, previousState, action, context }`, where `action` is the action that caused the transition (XState `state.event` parity). It is wired to the runtime's new `onTransition` subscription and fires only when the state name changes. The existing `useMachineSubscription(...)` hook is unchanged.
