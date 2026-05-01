# React Integration

`@tdreyno/fizz-react` is local-first. Most React usage starts with one machine per component via `useMachine(...)`, then scales to shared runtime context when needed.

It provides two React integration surfaces:

- `useMachine(...)` hosts one Fizz runtime inside one component instance
- `createMachineContext(...)` creates a typed Provider plus hook pair so a subtree can share one runtime

The main rule is the same as the rest of Fizz: keep the workflow in states and actions, and keep the React component focused on rendering and dispatching.

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

That pattern gives the subtree a single runtime:

- one child can dispatch through `actions`
- sibling and nested children re-render from the same `currentState`
- all consumers see the same `context` and `runtime`

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
- use `runtime` only for advanced cases such as output subscriptions or manual inspection

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

Because `selectWhen(...)` is a positive check, function-based selectors return `undefined` when non-matching.

### Simple default vs optimized opt-out

`useMachine(...)` defaults to the simple DX mode shown above. In that mode, selector values are ready to read directly from `machine.selectors` and all machine selectors are subscribed internally.

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

## Related Docs

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Debugging](./debugging.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Testing](./testing.md)
