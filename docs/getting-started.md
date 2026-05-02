# Getting Started

Fizz is a small TypeScript-first library for modeling workflows as explicit states and actions. The core loop is simple:

- define states with `state(...)`
- group the top-level states and actions with `createMachine(...)`
- define events with `action(...)`
- run the machine through a runtime
- return transitions, outputs, or effects from handlers

This page gets you to a working machine quickly, then points to the deeper guides.

## Start small, scale up

Fizz is designed to cover a range of workflow complexity:

- component-local state machines for isolated UI flows
- multi-step workflows with async and scheduling
- larger orchestration with nested or parallel machines

If you are deciding where your use case fits, read [Choosing The Right Scale](./choosing-scale.md).

## Install

Install the core runtime:

```bash
npm install --save @tdreyno/fizz
```

If you want the React hook integration as well:

```bash
npm install --save @tdreyno/fizz @tdreyno/fizz-react
```

## A first machine

This machine starts idle, enters an editing state, and saves a draft when the user triggers an action.

```typescript
import {
  ActionCreatorType,
  Enter,
  action,
  createMachine,
  createRuntime,
  enter,
  state,
} from "@tdreyno/fizz"

const startEditing = action("StartEditing")
type StartEditing = ActionCreatorType<typeof startEditing>

const saveDraft = action("SaveDraft").withPayload<{ content: string }>()
type SaveDraft = ActionCreatorType<typeof saveDraft>

type EditorData = {
  savedDrafts: string[]
}

const Idle = state<Enter | StartEditing, EditorData>(
  {
    Enter: (data, _, { update }) => update(data),
    StartEditing: data => Editing(data),
  },
  { name: "Idle" },
)

const Editing = state<Enter | SaveDraft, EditorData>(
  {
    Enter: (data, _, { update }) => update(data),

    SaveDraft: (data, payload, { update }) =>
      update({
        ...data,
        savedDrafts: [...data.savedDrafts, payload.content],
      }),
  },
  { name: "Editing" },
)

const EditorMachine = createMachine(
  {
    actions: { saveDraft, startEditing },
    states: { Editing, Idle },
  },
  "EditorMachine",
)

const runtime = createRuntime(
  EditorMachine,
  EditorMachine.states.Idle({ savedDrafts: [] }),
)

await runtime.run(enter())
await runtime.run(startEditing())
await runtime.run(saveDraft({ content: "First draft" }))

console.log(runtime.currentState().data.savedDrafts)
```

The important part is not the example itself. It is the shape:

- actions are explicit values with stable names
- the machine root is an explicit value you can share with hooks, contexts, docs, and CLI tooling
- state handlers receive `data`, the action payload, and helper utils
- handlers return the next state work instead of directly mutating the outside world

## What a handler can return

Fizz handlers usually return one of these things:

- `update(nextData)` to stay in the same state with new data
- `SomeOtherState(nextData)` to transition to another state
- `output(someAction(...))` to emit an integration-facing action
- an effect such as `startAsync(...)`, `startTimer(...)`, or a custom `effect(...)`
- an array containing several of those returns when one transition needs multiple outcomes

That gives you a single place to read the machine logic instead of scattering callbacks across components, timers, and requests.

## A small runtime demo

The runtime is the piece that feeds actions into the current state and applies the returned work.

```typescript
import { createRuntime, enter } from "@tdreyno/fizz"

const runtime = createRuntime(
  EditorMachine,
  EditorMachine.states.Idle({ savedDrafts: [] }),
)

await runtime.run(enter())
await runtime.run(startEditing())

console.log(runtime.currentState().name)
```

For app code, this means your UI or integration layer sends actions into the runtime and renders whatever state is current.

## React integration

If you are using React, `@tdreyno/fizz-react` lets you keep the machine model and drive it with `useMachine(...)`.

```typescript
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine(
  EditorMachine,
  EditorMachine.states.Idle({
    savedDrafts: [],
  }),
)

const currentState = machine.currentState
const isIdle = machine.currentState.is(machine.states.Idle)
```

Keep the component thin. Let the machine root own the workflow logic and let React render the current state.

See [React Integration](./react-integration.md) for the full `useMachine(...)` hook guide, including bound actions, runtime access, and current implementation caveats.

If you want guidance on when to stop at component-local state and when to move to orchestration patterns, read [Choosing The Right Scale](./choosing-scale.md).

## What to read next

- Read [Architecture](./architecture.md) for the mental model behind states, actions, transitions, outputs, and effects.
- Read [Output Actions](./output-actions.md) when adapters need command-style integrations. It includes `commandChannel(...)`, which is already available for channel-bound command and batch ergonomics.
- Read [Debugging](./debugging.md) when you want to inspect transitions, outputs, async work, or scheduler lifecycles in Node or the browser.
- Read [Chrome Debugger](./chrome-debugger.md) when you want a DevTools panel for running browser machines instead of raw console-only inspection.
- Read [React Integration](./react-integration.md) if you are using React and want the full hook API and integration patterns.
- Read [Complex Actions](./complex-actions.md) when a state starts handling larger action surfaces, lifecycle actions, or debounced and throttled branches.
- Read [Nested State Machines](./nested-state-machines.md) when one state needs to own a smaller workflow with its own local transitions.
- Read [Parallel State Machines](./parallel-state-machines.md) when one parent workflow needs several active child machines at the same time.
- Read [Custom Effects](./custom-effects.md) when the built-in async, timer, interval, or output helpers are not the right fit.
- Read [Async](./async.md), [Timers](./timers.md), and [Intervals](./intervals.md) for the detailed scheduling APIs.

## Related Docs

- [Architecture](./architecture.md)
- [Output Actions](./output-actions.md)
- [Debugging](./debugging.md)
- [Chrome Debugger](./chrome-debugger.md)
- [React Integration](./react-integration.md)
- [Custom Effects](./custom-effects.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Testing](./testing.md)
