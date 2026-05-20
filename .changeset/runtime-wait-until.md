---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

Add `runtime.waitUntil` and friends for awaiting state/output conditions.

The runtime now exposes a small awaitable predicate API so consumers can
stop reinventing `Promise + resolver + onOutput + cleanup` plumbing every
time a state machine has a request/response surface:

- `runtime.waitUntil(matcher, options?)` — primitive that resolves on the
  first match across state transitions and outputs.
- `runtime.waitUntilState(stateOrMatcher, options?)` — sugar for matching
  a target state, with optional `where` predicate over state data.
- `runtime.waitUntilOutput(matcher, options?)` — sugar for matching the
  next output. Accepts an action creator, a handler map keyed by action
  `type`, or a predicate.
- `runtime.runUntil(action, matcher, options?)` — subscribes before
  dispatching so synchronous transitions are not missed.

Matchers come from `matchState`, `matchOutput`, and `matchAny`. All four
runtime methods accept the same options:

- `signal?: AbortSignal` — rejects with `WaitUntilAbortError`.
- `timeout?: number` — rejects with `WaitUntilTimeoutError`.
- `includeCurrent?: boolean` — defaults to `true` for state matchers and
  resolves via microtask when the current state already matches.

Pending waits reject with `RuntimeDisconnectedError` if the runtime
disconnects. Each wait emits `wait-until-registered`, `wait-until-resolved`,
and `wait-until-rejected` monitor events for debugger visibility.

`@tdreyno/fizz-react` ships matching hooks that take the runtime returned
from `useMachine(...)` and abort on unmount:

- `useWaitUntilState(runtime, matcher, options?)` →
  `{ status, value, error }`
- `useWaitUntilOutput(runtime, matcher, options?)` →
  `{ status, value, error }`
- `useRunUntil(runtime)` → stable callback that aborts the previous wait
  when called again.

See `docs/awaiting-conditions.md` for the full surface.
