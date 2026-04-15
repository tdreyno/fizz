# React Integration

`@tdreyno/fizz-react` provides a React hook called `useMachine(...)` that hosts a Fizz runtime inside a component. It creates the runtime, subscribes to state changes, binds action creators, and gives React a machine-shaped value to render from.

The main rule is the same as the rest of Fizz: keep the workflow in states and actions, and keep the React component focused on rendering and dispatching.

## Install

```bash
npm install --save @tdreyno/fizz @tdreyno/fizz-react
```

## The hook shape

`@tdreyno/fizz-react` exports `useMachine(...)` from `@tdreyno/fizz-react`.

The current public shape is:

```typescript
useMachine(states, actions, initialState, outputActions?, options?)
```

The parameters are:

- `states`: an object of bound Fizz states, usually the same state object your app already uses
- `actions`: the internal action creators the runtime should accept
- `initialState`: the bound starting state, for example `Editing(initialData())`
- `outputActions`: optional action creators the machine may emit through `output(...)`
- `options`: optional runtime setup such as history size and logging

Under the hood, the hook:

- creates the initial context with `createInitialContext(...)`
- creates the runtime with `createRuntime(...)`
- binds the action creators through `runtime.bindActions(...)`
- subscribes to `runtime.onContextChange(...)`
- runs `enter()` in an effect after mount

```text
Component / hook / runtime flow

React component
  |
  v
useMachine(states, actions, initialState, ...)
  |
  +--> createInitialContext(...)
  |
  +--> createRuntime(...)
  |
  +--> bindActions(...)
  |
  +--> subscribe to onContextChange(...)
  |
  +--> run enter() after mount
  |
  v
returns { currentState, context, actions, runtime }
```

## What it returns

The hook returns an object with four useful pieces:

- `currentState`
- `context`
- `actions`
- `runtime`

In practice:

- use `currentState` to decide what to render
- use `actions` to dispatch events from the component
- use `context` when you need runtime history or lower-level inspection
- use `runtime` only for advanced cases such as output subscriptions or manual inspection

## A focused example

This example mirrors the shape used in the React example app: the machine is defined outside the component, then `useMachine(...)` hosts it.

```typescript
import {
  type ActionCreatorType,
  action,
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

export const useTimeoutMachine = () => {
  return useMachine(
    {
      TimeoutDemo,
    },
    {
      arm,
      cancel,
    },
    TimeoutDemo(initialData()),
  )
}

const TimeoutPanel = () => {
  const machine = useTimeoutMachine()
  const data = machine.currentState.data

  return (
    <div>
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

If your machine returns `output(...)`, pass an `outputActions` object as the fourth `useMachine(...)` argument so the runtime knows that output action surface.

In more advanced integrations, you can subscribe through `runtime.onOutput(...)` or `runtime.respondToOutput(...)`, but most components should start with `currentState` plus `actions` and only reach for runtime access when they really need it.

## Options and current caveats

The hook currently accepts an `options` object with these fields in its type:

- `maxHistory`
- `enableLogging`
- `restartOnInitialStateChange`

In the current implementation:

- `maxHistory` is used when creating the initial context
- `enableLogging` is used when creating the initial context
- `restartOnInitialStateChange` exists in the type but is not currently used by the hook implementation

There is one important behavior to keep in mind: the runtime is created once with `useMemo(..., [])`. That means changes to `initialState`, `actions`, `outputActions`, or `options` after mount do not rebuild the runtime automatically.

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

## Guidance

- Keep machine definitions outside the component body unless dynamic construction is truly required.
- Render from `currentState` instead of duplicating machine data in component state.
- Prefer `actions` over reaching into `runtime.run(...)` directly from components.
- Let the machine coordinate timers, async work, and outputs rather than rebuilding those flows with separate React effects.

## Example app

For a larger reference, see the React example app in [packages/react-example/src/app/page.tsx](../packages/react-example/src/app/page.tsx) and the machine hooks under [packages/react-example/src/machines/timeout.ts](../packages/react-example/src/machines/timeout.ts).

## Related Docs

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Testing](./testing.md)
