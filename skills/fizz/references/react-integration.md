# React Integration

Use this reference when the task involves `@tdreyno/fizz-react`, React components that host Fizz machines, or questions about `useMachine(...)`.

## Public Surface

`@tdreyno/fizz-react` exports:

- `useMachine(...)`
- `createMachineContext(...)`
- `useMachineSubscription(...)`

The current hook implementation in `packages/fizz-react/src/useMachine.ts`:

- creates the initial context with `createInitialContext(...)`
- creates the runtime with `createRuntime(...)`
- binds actions through `runtime.bindActions(actions)`
- subscribes to runtime context changes with `runtime.onContextChange(...)`
- runs `enter()` in an effect after mount
- calls `runtime.disconnect()` on unmount through the store lifecycle

The hook options include a `driver` field, which is forwarded to `createRuntime(...)` as `browserDriver`.

Use the built-in browser driver from core:

```typescript
import { browserDriver } from "@tdreyno/fizz/browser"
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine(FlowMachine, FlowMachine.states.Ready(initialData), {
  driver: browserDriver,
})
```

## What The Hook Returns

The hook returns an object shaped around:

- `currentState`
- `states`
- `context`
- `actions`
- `runtime`

Treat that return value as the bridge between React rendering and the machine runtime.

## `createMachineContext(...)`

Use `createMachineContext(...)` when multiple components should consume one shared machine instance without prop drilling.

It returns a Provider and a consumer hook pair, so tree branches can read the same machine value.

Prefer this pattern for page- or feature-scoped workflows where siblings need synchronized machine state and actions.

## Design Guidance

### Keep the machine authoritative

Business workflow belongs in Fizz states and actions. React components should mostly:

- render from `currentState` or `context`
- branch on state identity with `currentState.is(machine.states.SomeState)`
- call bound actions in response to user input
- avoid re-implementing transition logic in local component state

### Keep machine definitions stable

Define states and action creators outside the component body unless the task specifically needs dynamic machine construction. This avoids mixing render concerns with machine architecture.

When modeling browser confirmation flows in React:

- prefer dedicated machine states for confirm/prompt steps
- use `confirm(...)` and `prompt(...)` effects in those states
- handle built-in resolution actions (`ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, `PromptCancelled`) in the machine

### Use bound actions from the hook

The hook binds runtime actions for you. Prefer calling the returned `actions` object instead of reaching into the runtime manually from the component.

### Use `useMachineSubscription(...)` for imperative observation

When a component needs to react to transitions imperatively (analytics pings, closing a modal after state exit, bridge callbacks), prefer `useMachineSubscription(...)` instead of wiring manual runtime listeners.

- `useMachineSubscription(machine, listener, options?)`
- options: `{ emitCurrent?: boolean }`
- listener receives `(currentState, context)`

```typescript
useMachineSubscription(
  machine,
  currentState => {
    if (currentState.is(machine.states.Saved)) {
      onClose()
    }
  },
  { emitCurrent: true },
)
```

### Use `useWaitUntilState`, `useWaitUntilOutput`, and `useRunUntil` for awaitable conditions

When a component needs to wait for a state or output before continuing (gate navigation, show a loading badge, close a dialog on an outcome), prefer the `useWaitUntil*` hooks over manual `onContextChange`/`onOutput` plumbing.

- `useWaitUntilState(runtime, stateOrMatcher, options?)` → `{ status, value, error }`
- `useWaitUntilOutput(runtime, matcherArg, options?)` → `{ status, value, error }`
- `useRunUntil(runtime)` → stable callback `(action, matcher, options?) => Promise<T>`

All three abort pending waits on unmount. `useRunUntil`'s callback also aborts the previous wait when called again. Options use the same `WaitUntilOptions` shape (`signal`, `timeout`, `includeCurrent`).

```typescript
const machine = useMachine(MyMachine, MyMachine.states.Editing({}))
const runUntil = useRunUntil(machine.runtime)

await runUntil(save(), matchState(MyMachine.states.Saved))
```

Unmount also applies the core runtime async teardown contract:

- pending debounce timers are cleared
- in-flight async helper work is aborted
- settled results after unmount are discarded instead of dispatching back into the runtime

In StrictMode development builds, mount and unmount may happen more than once. Keep teardown code idempotent and treat aborts during unmount as expected.

### Use `machine.selectors` for derived render values

When render logic depends on reusable derived checks, define selectors on the machine root with `selectWhen(...)` and consume them through `machine.selectors` from `useMachine(...)` or `useMachineContext(...)`.

- keeps state filters explicit with `when`
- narrows state data inside selector branches
- supports optional `equalityFn` to suppress equivalent object-output churn

Prefer colocated selectors over repeating derived object construction in component bodies when several components share the same derivation.

For render-critical surfaces, set `disableAutoSelectors: true` in `useMachine(...)` and read values with `useSelector(...)`.

- simple mode (default): easier direct reads from `machine.selectors`
- optimized mode: explicit selector reads with tighter render skipping

### Be careful with initialization assumptions

The runtime bootstrap happens in an effect. If the task depends on what happens on entry, reason from that lifecycle rather than assuming the machine is fully entered during render.

## Review Heuristics

When reviewing fizz-react code, check these first:

- Is machine logic living in Fizz states rather than component-local state?
- Are components dispatching through the bound `actions` interface?
- Is the component rendering from machine state instead of duplicating it?
- Does the task require runtime access, or is `currentState` plus `actions` enough?

## When Not To Use This Reference

If the task is really about runtime semantics, effect helpers, or cancellation behavior, switch back to:

- `core-runtime.md`
- `async-and-scheduling.md`
