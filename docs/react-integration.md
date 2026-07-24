# React Integration

`@tdreyno/fizz-react` is local-first. Most React usage starts with one machine per component via `useMachine(...)`, then scales to shared runtime context when needed.

It provides two integration surfaces:

- `useMachine(...)` hosts one Fizz runtime inside one component instance
- `createMachineContext(...)` creates a typed Provider plus hook pair so a subtree can share one runtime

The main rule is the same as the rest of Fizz: keep workflow in states and actions, and keep React components focused on rendering and dispatching.

## Install

```bash
npm install --save @tdreyno/fizz @tdreyno/fizz-react
```

## The hook shape

`@tdreyno/fizz-react` exports `useMachine(...)` and `createMachineContext(...)`.

The isolated hook shape is:

```typescript
useMachine(machine, initialState, options?)
```

The parameters are:

- `machine`: the result of `createMachine(...)`, which groups the top-level states, actions, and optional output actions
- `initialState`: the bound starting state, for example `Editing(initialData())`
- `options`: optional runtime setup such as history size and logging

The hook reads `machine.actions` and `machine.outputActions` from that root value, so your component only needs to provide the machine and the initial bound state.

Under the hood, the hook:

- creates the runtime with `createRuntime(machine, initialState, options?)`
- binds the action creators through `runtime.bindActions(...)`
- subscribes to `runtime.onContextChange(...)`
- runs `enter()` in an effect after mount
- calls `runtime.disconnect()` on unmount

```text
Component / hook / runtime flow

React component
  |
  v
useMachine(machine, initialState, ...)
  |
  +--> createRuntime(machine, initialState, ...)
  |
  +--> bindActions(...)
  |
  +--> subscribe to onContextChange(...)
  |
  +--> run enter() after mount
  |
  v
returns { currentState, states, context, actions, runtime }
```

## Unmount teardown semantics

`useMachine(...)` and `createMachineContext(...)` both tear the runtime down with `runtime.disconnect()` on unmount.

That means React unmount gets the same guarantees documented in [Async](./async.md):

- pending debounced async timers are cleared
- in-flight async helper work is aborted
- post-unmount async completions do not dispatch actions back into the dead runtime
- pending wait helpers reject instead of hanging

In React StrictMode development builds, mount and unmount may happen more than once. Treat disconnect-side aborts as expected and keep controller cleanup idempotent.

If a close path needs to finish the latest autosave before unmount-driven teardown, flush that `asyncId` from controller code first and then let unmount disconnect the runtime.

## Shared runtime context (scale-up)

When multiple components should observe and dispatch against the same machine instance, create a typed context wrapper once and configure the shared instance at the Provider boundary.

Use this when you outgrow one component-local machine and need coordinated state across a subtree.

The shared API shape is:

```typescript
const { Provider, useMachineContext } = createMachineContext(machine)
```

The Provider accepts:

- `initialState`: the bound starting state for that shared runtime instance
- `options`: optional runtime setup such as history size and logging
- `children`: the subtree that should share the runtime

The consumer hook returns the same shape as `useMachine(...)`:

- `currentState`
- `states`
- `context`
- `actions`
- `runtime`

## A shared example

```typescript
import {
  type ActionCreatorType,
  action,
  createMachine,
  type Enter,
  state,
} from "@tdreyno/fizz"
import { createMachineContext } from "@tdreyno/fizz-react"

const increment = action("Increment")
type Increment = ActionCreatorType<typeof increment>

const reset = action("Reset")
type Reset = ActionCreatorType<typeof reset>

type Data = {
  count: number
}

const Counter = state<Enter | Increment | Reset, Data>(
  {
    Enter: data => data,

    Increment: (data, _, { update }) =>
      update({
        ...data,
        count: data.count + 1,
      }),

    Reset: (_, __, { update }) =>
      update({
        count: 0,
      }),
  },
  { name: "Counter" },
)

const CounterMachine = createMachine({
  actions: {
    increment,
    reset,
  },
  states: {
    Counter,
  },
}, "CounterMachine")

const { Provider: CounterProvider, useMachineContext: useCounterMachine } =
  createMachineContext(CounterMachine)

const CounterToolbar = () => {
  const machine = useCounterMachine()

  return (
    <div>
      <button onClick={() => machine.actions.increment()}>Increment</button>
      <button onClick={() => machine.actions.reset()}>Reset</button>
    </div>
  )
}

const CounterLabel = () => {
  const machine = useCounterMachine()

  return <p>Count: {machine.currentState.data.count}</p>
}

const CounterScreen = () => {
  return (
    <CounterProvider initialState={CounterMachine.states.Counter({ count: 2 })}>
      <CounterToolbar />
      <CounterLabel />
    </CounterProvider>
  )
}
```

That pattern gives the subtree one runtime:

- a child can dispatch through `actions`
- sibling and nested children re-render from the same `currentState`
- all consumers read the same `context` and `runtime`

## What it returns

The hook returns an object with five useful pieces:

- `currentState`
- `states`
- `context`
- `actions`
- `runtime`

In practice:

- use `currentState.is(machine.states.SomeState)` to branch on state identity
- use `currentState` and `currentState.data` to render state labels and data
- use `actions` to dispatch events from the component
- use `context` when you need runtime history or lower-level inspection
- use `runtime` for advanced cases such as output subscriptions or manual inspection

## Selectors

Use selectors when you want derived values like `isEditable` or `canSave` without repeating state checks in every component.

Define selectors on the machine root with `selectWhen(...)`, then read derived values from `machine.selectors` returned by `useMachine(...)` or `useMachineContext(...)`.

Function selectors use the shape `(data, state, context) => result`.

```typescript
import { createMachine, selectWhen } from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

const EditorMachine = createMachine(
  {
    actions: { startEditing },
    selectors: {
      isEditable: selectWhen(Editing, data => !data.readOnly),
      hasInteractiveLabel: selectWhen(
        [Editing, Reviewing] as const,
        { label: "Interactive" },
      ),
    },
    states: { Editing, Reviewing, Viewing },
  },
  "EditorMachine",
)

const EditorPanel = () => {
  const machine = useMachine(EditorMachine, EditorMachine.states.Viewing())
  const isEditable = machine.selectors.isEditable
  const hasInteractiveLabel = machine.selectors.hasInteractiveLabel

  return (
    <div>
      <p>{hasInteractiveLabel ? "Interactive" : "Read only"}</p>
      <button disabled={!isEditable}>Edit</button>
    </div>
  )
}
```

When selector matching grows beyond shallow key checks, use [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) and pass `isMatching(...)` directly:

```typescript
import { isMatching } from "ts-pattern"

const machine = createMachine({
  selectors: {
    hasInteractiveMeta: selectWhen(
      Editing,
      isMatching({ label: "Interactive", meta: { mode: "edit" } }),
    ),
  },
  states: { Editing, Viewing },
})
```

Install when needed:

```bash
npm install ts-pattern
```

With matcher shorthand objects, selectors return booleans: `true` when matched and `false` otherwise.

Because `selectWhen(...)` is a positive check, function-based selectors return `undefined` when non-matching. Pass `{ defaultValue }` to `selectWhen(...)` when you want a stable non-match value (for example `false` or `0`) instead.

### Simple default vs optimized opt-out

`useMachine(...)` defaults to the simple DX mode shown above. In that mode, selector values are ready to read directly from `machine.selectors`, and all machine selectors are subscribed internally.

For render-critical screens, set `disableAutoSelectors: true` and use `useSelector(...)`.

```typescript
import { useMachine, useSelector } from "@tdreyno/fizz-react"

const machine = useMachine(EditorMachine, EditorMachine.states.Viewing(), {
  disableAutoSelectors: true,
})

const hasInteractiveLabel = useSelector(
  machine,
  snapshot => snapshot.selectors.hasInteractiveLabel,
)
```

Tradeoffs:

- Simple mode: best ergonomics, but components can still re-render when unused selectors change.
- Optimized mode: explicit `useSelector(...)` calls, but tighter render skipping for selected values.

## A focused example

This example mirrors the shape used in the React example app: the machine is defined outside the component, then `useMachine(...)` hosts it.

```typescript
import {
  type ActionCreatorType,
  action,
  createMachine,
  type Enter,
  state,
} from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

const arm = action("Arm")
type Arm = ActionCreatorType<typeof arm>

const cancel = action("Cancel")
type Cancel = ActionCreatorType<typeof cancel>

type TimeoutId = "toast"

type Data = {
  delayMs: number
  status: "idle" | "armed" | "elapsed"
}

const TimeoutDemo = state<Enter | Arm | Cancel, Data, TimeoutId>(
  {
    Enter: (data, _, { update }) => update(data),

    Arm: (data, _, { startTimer, update }) => [
      update({
        ...data,
        status: "armed",
      }),
      startTimer("toast", data.delayMs),
    ],

    Cancel: (data, _, { cancelTimer, update }) => [
      update({
        ...data,
        status: "idle",
      }),
      cancelTimer("toast"),
    ],

    TimerCompleted: (data, _, { update }) =>
      update({
        ...data,
        status: "elapsed",
      }),
  },
  { name: "TimeoutDemo" },
)

const initialData = (): Data => ({
  delayMs: 1800,
  status: "idle",
})

const TimeoutMachine = createMachine({
  actions: {
    arm,
    cancel,
  },
  states: {
    TimeoutDemo,
  },
}, "TimeoutMachine")

export const useTimeoutMachine = () => {
  return useMachine(
    TimeoutMachine,
    TimeoutMachine.states.TimeoutDemo(initialData()),
  )
}

const TimeoutPanel = () => {
  const machine = useTimeoutMachine()
  const data = machine.currentState.data
  const isTimeoutDemo = machine.currentState.is(machine.states.TimeoutDemo)

  return (
    <div>
      <p>{isTimeoutDemo ? "TimeoutDemo" : "Other"}</p>
      <p>{machine.currentState.name}</p>
      <p>Status: {data.status}</p>
      <button onClick={() => machine.actions.arm()}>Arm</button>
      <button onClick={() => machine.actions.cancel()}>Cancel</button>
    </div>
  )
}
```

The important part is not the JSX. It is the boundary:

- the machine owns the transition logic
- the component renders `currentState`
- the component checks state identity through `currentState.is(machine.states.SomeState)`
- UI events call `machine.actions.*`

```text
Rendering and dispatch boundary

user clicks button
  |
  v
machine.actions.arm()
  |
  v
runtime.run(Arm)
  |
  v
state transition happens inside the machine
  |
  v
onContextChange notifies the hook
  |
  v
React re-renders from currentState
```

## Bound actions and `asPromise()`

The `actions` object returned by the hook contains bound action dispatchers. Calling one dispatches the action into the runtime immediately.

```typescript
machine.actions.arm()
```

Each bound action also returns an object with `asPromise()` when you need to wait for the dispatch to complete:

```typescript
await machine.actions.arm().asPromise()
```

That pattern is useful when a component needs to coordinate follow-up UI work after the action has been processed.

## Output actions

If your machine returns `output(...)`, define those action creators on `machine.outputActions` when you create the machine root. `useMachine(...)` and `createMachineContext(...)` will pass that output surface through to the runtime automatically.

In more advanced integrations, you can subscribe through `runtime.onOutput(...)` or `runtime.respondToOutput(...)`, but most components should start with `currentState` plus `actions` and only reach for runtime access when they really need it.

## Imperative State Subscriptions

When a component needs imperative observation (for example, calling a close handler once a workflow leaves `Saving`), prefer `useMachineSubscription(...)`.

```tsx
import { useMachine, useMachineSubscription } from "@tdreyno/fizz-react"

const machine = useMachine(FormMachine, FormMachine.states.Editing(initialData))

useMachineSubscription(
  machine,
  nextState => {
    if (!nextState.is(machine.states.Saving)) {
      resolvePendingClose()
    }
  },
  { emitCurrent: true },
)
```

The same hook also works for the Provider/context form:

```tsx
import {
  createMachineContext,
  useMachineSubscription,
} from "@tdreyno/fizz-react"

const { Provider, useMachineContext } = createMachineContext(FormMachine)

const Observer = () => {
  const machine = useMachineContext()

  useMachineSubscription(machine, nextState => {
    if (nextState.is(machine.states.Ready)) {
      notifyReady()
    }
  })

  return null
}
```

`useMachineSubscription(...)` keeps one subscription system (`runtime.onContextChange(...)`) while handling mount/unmount cleanup and optional immediate replay.

If you need full access to raw context objects, subscribe directly with `runtime.onContextChange(...)`.

### Observing transitions with `useTransition`

When you care about the transition itself, including the new state, where it came from, and the action that caused it, use `useTransition(...)`. The listener receives `{ state, previousState, action, context }` and fires only when the state name changes (not on same-state data updates), wired to the runtime's `onTransition(...)` subscription.

```tsx
import { useMachine, useTransition } from "@tdreyno/fizz-react"

const machine = useMachine(FormMachine, FormMachine.states.Editing(initialData))

useTransition(machine, ({ state, previousState, action }) => {
  analytics.track("machine_transition", {
    from: previousState?.name,
    to: state.name,
    via: action?.type,
  })
})
```

This pairs with the runtime's `getFlow(...)` / `getVisitedStateNames(...)` when you want to capture the full session path, not only individual transitions.

## Options and current caveats

The hook currently accepts an `options` object with these fields in its type:

- `maxHistory`
- `enableLogging`
- `driver`
- `restartOnInitialStateChange`

In the current implementation:

- `maxHistory` is used when creating the initial context
- `enableLogging` is used when creating the initial context
- `driver` is forwarded to runtime creation as the browser driver option
- `restartOnInitialStateChange` exists in the type but is not currently used by the hook implementation
- runtime `monitor` options are not currently forwarded through the hook setup

Use the built-in browser implementation from the browser entrypoint when you want a browser-backed driver:

`browserDriver` is imported from `@tdreyno/fizz/browser` (not from `@tdreyno/fizz`).

```typescript
import { browserDriver } from "@tdreyno/fizz/browser"
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine(MyMachine, MyMachine.states.Ready(initialData), {
  driver: browserDriver,
})
```

When using browser-driven confirmation flows, treat `confirm` and `prompt` as runtime-owned request/response primitives:

- they can resolve after normal machine state transitions
- they map back into built-in actions such as `ConfirmAccepted`/`ConfirmRejected` and `PromptSubmitted`/`PromptCancelled`
- they are not tied to state-local scheduler cleanup in the same way as timers and async jobs

There is one important behavior to keep in mind: the runtime is created once with `useMemo(..., [])`. That means changes to `machine`, `initialState`, or `options` after mount do not rebuild the runtime automatically.

```text
Lifetime of the hosted runtime

first render
  |
  v
create runtime once
  |
  v
subsequent renders reuse same runtime
  |
  +--> updated props do not rebuild runtime automatically
```

Treat the machine definition and initial state as stable inputs for the life of the component instance.

The same caveat applies to `createMachineContext(...)`: each mounted Provider creates one runtime once for its subtree and does not rebuild that runtime automatically when Provider props change later.

## Guidance

- Keep machine definitions outside the component body unless dynamic construction is truly required.
- Use `useMachine(...)` when a component should own its own isolated runtime.
- Use `createMachineContext(...)` when a subtree should share one runtime instance.
- Render from `currentState` instead of duplicating machine data in component state.
- Prefer `actions` over reaching into `runtime.run(...)` directly from components.
- Let the machine coordinate timers, async work, and outputs rather than rebuilding those flows with separate React effects.
- Use `runtime` for targeted inspection and subscriptions, not as a replacement for the bound `actions` surface.

If you need browser console debugging today, use `runtime.onContextChange(...)` and `runtime.onOutput(...)` from the returned `runtime`, or create the runtime directly when you need the full structured monitor. See [Debugging](./debugging.md).

## Example app

For a larger reference, see the React example app in [packages/react-example/src/app/page.tsx](../packages/react-example/src/app/page.tsx) and the machine hooks under [packages/react-example/src/machines/timeout.ts](../packages/react-example/src/machines/timeout.ts).

## Awaiting conditions in components

The runtime ships hooks for waiting on a state or output condition from
inside a component. They're useful when an interaction needs to wait for
the machine to settle before navigating, showing a dialog, or measuring
an outcome.

```tsx
import { matchState, useMachine } from "@tdreyno/fizz-react"
import { useRunUntil, useWaitUntilState } from "@tdreyno/fizz-react"

function SaveButton() {
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

`useWaitUntilState` returns `{ status, value, error }` and aborts on
unmount. `useRunUntil` returns a stable callback that also aborts the
previous wait when called again. See
[Awaiting Conditions](./awaiting-conditions.md) for the full surface,
matchers, and cancellation semantics.

## Related Docs

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Awaiting Conditions](./awaiting-conditions.md)
- [Debugging](./debugging.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Persistence](./persistence.md) — snapshot on unmount, rehydrate the machine on mount
- [Testing](./testing.md)
