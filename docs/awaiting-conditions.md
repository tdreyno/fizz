# Awaiting Conditions

Sometimes a controller dispatches an action and needs to wait until the
machine reaches a meaningful resting point — a particular state, an output
action, or some predicate over either.

## When to use it

Reach for `waitUntil` when:

- You dispatch an action and want a single `Promise` that resolves when
  the machine settles into a specific state.
- You need to map several possible output actions onto one outcome
  (`Closed → true`, `Blocked → false`).
- You want to await a condition that may already be true when you start
  listening (e.g. "wait until we're in `Ready`").
- You want cancellation: an `AbortSignal` or `timeout` cleans up the
  underlying subscriptions for you.

For "subscribe to every transition" or "render the current state", keep
using `runtime.onContextChange`, `runtime.onOutput`, and the React hooks
in [react-integration.md](./react-integration.md).

## The matcher and the wait

There are two pieces:

1. A **matcher** describes the condition.
2. `runtime.waitUntil` (and its sugar) subscribes, races the matcher
   against the optional `signal`/`timeout`, and returns a Promise.

```ts
import { matchOutput, matchState } from "@tdreyno/fizz"

// Wait for a state.
const ready = await runtime.waitUntilState(States.Ready)

// Wait for the next output of type "Saved".
const saved = await runtime.waitUntilOutput(savedAction)

// Map outputs to outcomes (primitive shorthand).
const outcome = await runtime.waitUntilOutput({
  Closed: true,
  Blocked: false,
})

// Or pass a function per type for derived values.
const derived = await runtime.waitUntilOutput({
  Saved: action => action.payload,
})
```

`waitUntilState` accepts either a state constructor or a `matchState`
result. `waitUntilOutput` accepts an action creator, a handler map keyed
by action `type`, a predicate function, or a `matchOutput` result.

Handler-map entries can be either a function `(action) => value | undefined`
or a direct value. Direct values are returned as the wait result whenever
the action `type` matches — handy for predicate-style mappings like
`{ Saved: true, Failed: false }`. Function entries that return
`undefined` are treated as "no match" and let the wait keep listening.

### Filtering with `where`

`matchState` takes a `where` predicate over the state's data so you can
wait for a particular shape:

```ts
import { matchState } from "@tdreyno/fizz"

await runtime.waitUntilState(
  matchState(States.Loaded, { where: data => data.ready }),
)
```

### Predicate over both channels

`matchAny` runs against both state transitions and outputs:

```ts
import { matchAny } from "@tdreyno/fizz"

const settled = await runtime.waitUntil(
  matchAny(event => {
    if (event.kind === "state" && event.state.is(States.Ready)) {
      return "ready" as const
    }
    if (event.kind === "output" && event.output.type === "Error") {
      return "error" as const
    }
    return undefined
  }),
)
```

## Dispatch and await in one step

`runUntil` is sugar for "subscribe to a matcher, then dispatch an action,
then await the matcher". It avoids the race where a synchronous
transition would fire before the subscriber is attached:

```ts
const ready = await runtime.runUntil(start(), matchState(States.Ready))
```

## Cancellation

All wait helpers accept the same options object:

```ts
type WaitUntilOptions = {
  signal?: AbortSignal
  timeout?: number
  includeCurrent?: boolean
}
```

- `signal` rejects the wait with `WaitUntilAbortError` when aborted.
- `timeout` (milliseconds) rejects with `WaitUntilTimeoutError`.
- `includeCurrent` defaults to `true` for state matchers — the wait
  resolves immediately (via microtask) if the current state already
  matches. Set to `false` to require an explicit transition.
- If the runtime disconnects while a wait is pending, the Promise
  rejects with `RuntimeDisconnectedError`.

```ts
const controller = new AbortController()

const promise = runtime.waitUntilOutput(savedAction, {
  signal: controller.signal,
  timeout: 5_000,
})

controller.abort() // promise rejects with WaitUntilAbortError
```

## React

`@tdreyno/fizz-react` ships matching hooks. They take the runtime from a
`useMachine()` call (or any other source) and abort on unmount:

```tsx
import { matchState, useMachine } from "@tdreyno/fizz-react"
import { useRunUntil, useWaitUntilState } from "@tdreyno/fizz-react"

function ReadyBadge() {
  const machine = useMachine(MyMachine, MyMachine.states.Initializing({}))
  const ready = useWaitUntilState(machine.runtime, MyMachine.states.Ready)

  if (ready.status === "pending") return <span>Loading…</span>
  if (ready.status === "rejected") return <span>Error</span>
  return <span>Ready</span>
}

function Save() {
  const machine = useMachine(MyMachine, MyMachine.states.Editing({}))
  const runUntil = useRunUntil(machine.runtime)

  return (
    <button
      onClick={async () => {
        await runUntil(save(), matchState(MyMachine.states.Saved))
      }}
    >
      Save
    </button>
  )
}
```

`useRunUntil` aborts the previous wait when the callback is called again
and on unmount.

## Related docs

- [Async](./async.md) — for the underlying scheduling model.
- [Testing](./testing.md) — `runUntil` is a good fit for tests that need
  a single Promise for a round-trip.
- [Dispatch And Read](./dispatch-and-read.md) — for read-after-dispatch
  patterns that don't need awaiting.
- [React Integration](./react-integration.md) — for the hook surface.
