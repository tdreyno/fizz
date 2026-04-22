# API

This page documents the core `@tdreyno/fizz` APIs intended for everyday machine authoring. It focuses on the root exports you use to define actions, states, effects, and runtimes.

Dedicated guides already cover the deeper scheduling and testing APIs:

- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals And Frames](./intervals.md)
- [Testing](./testing.md)

Optional fluent authoring style:

- [Fluent API](./fluent-api.md)

Use the fluent entry point when you prefer chain-first state definitions:

```ts
import { state } from "@tdreyno/fizz/fluent"
```

The root `@tdreyno/fizz` object-style APIs remain fully supported.

## Machines

### `createMachine`

Create an explicit machine root that groups your top-level states, actions, and optional output actions in one value. Pass an optional second `name` argument when you want a stable machine name for CLI discovery, logging, or debugging.

```ts
const EditorMachine = createMachine(
  {
    actions: { saveDraft, startEditing },
    initialState: Idle({ draftId: null }),
    outputActions: { draftSaved },
    states: { Editing, Idle },
  },
  "EditorMachine",
)
```

Use `createMachine(...)` when you want one stable root for integrations, examples, or CLI discovery. Set `initialState` when the machine should carry a default starting state for helpers like `createParallelMachine(...)`. The CLI only discovers default-exported machine roots created this way.

Each created machine also exposes `.withInitialState(...)` to produce a copy with a different runtime starting state.

```ts
const RuntimeEditorMachine = EditorMachine.withInitialState(
  Editing({ draftId: "draft-42" }),
)
```

### `selectWhen`

Define colocated selectors on a machine root for read-only derived checks. Selectors are part of the core machine definition and are not React-specific.

```ts
const EditorMachine = createMachine({
  actions: { startEditing },
  selectors: {
    isEditable: selectWhen(Editing, data => !data.readOnly),
    canReview: selectWhen([Editing, Reviewing] as const, (data, state) => {
      if (state.is(Editing)) {
        return !data.readOnly
      }

      return data.approved === false
    }),
  },
  states: { Editing, Reviewing, Viewing },
})
```

`selectWhen(...)` accepts:

- `when`: one state creator or a readonly array of state creators
- second argument: either a `select` function with shape `(data, state, context) => result` (runs only when `currentState` matches `when`) or a matcher object shorthand
- optional final `options` object: `{ equalityFn? }`
- function selectors return `undefined` when `currentState` does not match `when`
- matcher-object selectors return `true` when all matcher keys equal `state.data` values, otherwise `false`

Prefer matcher-object shorthand when you want a boolean predicate over `state.data` keys.

Matcher-object shorthand example:

```ts
const hasInteractiveLabel = selectWhen([Editing, Reviewing] as const, {
  label: "Interactive",
})
```

For complex nested matching, discriminated unions, or array/primitive matching, use [`ts-pattern`](https://github.com/gvergnaud/ts-pattern) and pass `isMatching(...)` directly as the selector function:

```ts
import { isMatching } from "ts-pattern"

const hasInteractiveMeta = selectWhen(
  Editing,
  isMatching({ label: "Interactive", meta: { mode: "edit" } }),
)
```

Install when needed:

```bash
npm install ts-pattern
```

This keeps state checks centralized and colocated with machine definitions, instead of repeating `currentState.is(...)` branches in components.

In React, `useMachine(...)` defaults to simple selector reads through `machine.selectors`. For render-critical paths, set `disableAutoSelectors: true` and consume values with `useSelector(...)`.

You can evaluate selectors anywhere you have the current state and context, including plain runtime usage outside React:

```ts
const runtime = createRuntime(EditorMachine, EditorMachine.states.Viewing())

await runtime.run(enter())

const isEditable = runStateSelector(
  EditorMachine.selectors.isEditable,
  runtime.currentState(),
  runtime.context,
)
```

### `createParallelMachine`

Create a machine root that owns multiple child machines at the same time and broadcasts shared actions to every branch that can handle them.

```ts
const parallel = createParallelMachine({
  left: LeftMachine.withInitialState(LeftMachine.states.Loading()),
  right: RightMachine.withInitialState(RightMachine.states.Ready()),
})

await runtime.run(parallel.actions.refresh())
```

Each branch must be the result of `createMachine(...)` and must carry its own `initialState`.

Use this when several child workflows are active together and one parent action should fan out across those branches.

See [Parallel State Machines](./parallel-state-machines.md) for the full walkthrough and when to choose this instead of `stateWithNested(...)`.

### `getParallelRuntimes`

Read the current child runtime map from a parallel machine state's data.

```ts
const runtime = createRuntime(parallel.machine, parallel.initialState)

await runtime.run(enter())

const branches = getParallelRuntimes(runtime.currentState().data)
```

This is the main helper for integrations that need keyed access to child branch runtimes without reaching into `PARALLEL_RUNTIMES` directly.

## Actions

### `action`

Create a typed action creator, or create an action value directly.

```ts
const save = action("Save").withPayload<{ id: string }>()

save({ id: "1" })
action("Loaded", { id: "1" })
```

### `enter`

Bootstrap a runtime or enter a transitioned state.

```ts
await runtime.run(enter())
```

On the first call to `runtime.run(enter())`, Fizz performs its internal pre-entry bootstrap before running any `Enter` handlers.

### `exit`

Represents state exit.

```ts
const Closing = state<Exit>({
  Exit: () => log("leaving"),
})
```

Use this when a state needs to react to being left.

### `onFrame`

Represents an animation-frame tick.

```ts
const Spinning = state<Enter | OnFrame>({
  OnFrame: (_data, timestamp) => log(timestamp),
})
```

Frame scheduling itself is documented in [Intervals And Frames](./intervals.md).

### `isAction`

Type guard for action values.

```ts
if (isAction(value)) {
  console.log(value.type)
}
```

Use this when you need to narrow unknown input before treating it as a Fizz action.

## Context And Runtime

### `createInitialContext`

Create the initial runtime context from a starting state transition.

```ts
const context = createInitialContext([Initial()], {
  maxHistory: 10,
  enableLogging: true,
})
```

The `history` array must start with at least one state transition.

### `createRuntime`

Create a runtime that can execute actions, transitions, and effects.

```ts
const machine = createMachine({
  actions,
  outputActions,
  states: { Initial },
})
const runtime = createRuntime(machine, Initial(), {
  maxHistory: 10,
})

await runtime.run(enter())
```

For low-level usage where you already have a `Context`, construct `new Runtime(...)` directly.

The returned `Runtime` is the main execution object. The most commonly used methods are:

- `run(action)`
- `currentState()`
- `currentHistory()`
- `onContextChange(handler)`
- `onOutput(handler)`
- `respondToOutput(type, handler)`
- `bindActions(actions)`
- `disconnect()`

## Effects

### `effect`

Create a custom effect.

```ts
const saveDraft = effect("saveDraft", { id: "1" }, context => {
  context.customLogger?.(["saved"], "log")
})
```

Use this when the built-in helpers do not fit and you need an explicit effect object.

### `goBack`

Transition to the previous state in history.

```ts
const Details = state({
  Cancel: () => goBack(),
})
```

### `output`

Emit an output action to `runtime.onOutput(...)` subscribers.

```ts
const saved = action("Saved")

const Saving = state<Enter>({
  Enter: () => output(saved()),
})
```

### `log`

Create a logging effect.

```ts
const Loading = state<Enter>({
  Enter: () => log("loading"),
})
```

### `warn`

Create a warning effect.

```ts
const Editing = state({
  Invalid: () => warn("missing title"),
})
```

### `error`

Create an error logging effect.

```ts
const Failed = state({
  Enter: () => error("request failed"),
})
```

### `noop`

Create an intentional no-op effect.

```ts
const Idle = state({
  Ping: () => noop(),
})
```

### `requestJSONAsync` and `customJSONAsync` retry policy

Both JSON async builders support an optional `retry` policy in their `init` argument.

Use this when a request or client callback should retry with fixed or exponential backoff.

```ts
requestJSONAsync("/api/profile", {
  retry: {
    attempts: 4,
    strategy: {
      kind: "exponential",
      baseDelayMs: 200,
      maxDelayMs: 2000,
    },
  },
})
```

See [Async](./async.md) for complete retry policy options and examples.

## States

### `state`

Create a state definition from a map of action handlers.

```ts
const finish = action("Finish")

const Start = state<Enter | ReturnType<typeof finish>>(
  {
    Finish: () => Done({ done: true }),
  },
  { name: "Start" },
)

const Done = state<Enter, { done: boolean }>({}, { name: "Done" })
```

`state(...)` is the main authoring API. Each handler receives `(data, payload, utils)` and can return a transition, an action, an effect, an array of returns, or a promise of those values.

`update(nextData)` remains the standard way to apply same-state data updates. If you prefer draft-style nested edits, you can optionally compute `nextData` with Immer `produce(...)` and pass that result to `update(...)`.

```ts
import { produce } from "immer"

const Editing = state({
  SetStreet: (data, payload, { update }) =>
    update(
      produce(data, draft => {
        draft.profile.address.street = payload.street
      }),
    ),
})
```

This pattern is optional and does not change the Fizz runtime API.
See [Fluent API](./fluent-api.md#nested-updates-with-immer) for the same approach in fluent-style state definitions.

### `stateWithNested`

Create a state that owns an embedded child runtime.

```ts
const Parent = stateWithNested(
  {
    Save: data => updateParent(data),
  },
  ChildStates.Initial(),
  ChildActions,
  { name: "Parent" },
)
```

Use this when nested composition makes the machine easier to reason about, not just to avoid a few repeated handlers.

See [Nested State Machines](./nested-state-machines.md) for a practical walkthrough of parent and child communication.
If the problem is several active child workflows instead of one parent-owned child workflow, use [Parallel State Machines](./parallel-state-machines.md) instead.

### `debounce`

Wrap a handler so it only runs after a quiet period.

```ts
const Editing = state({
  InputChanged: debounce((data, payload, { update }) => {
    return update({ ...data, value: payload })
  }, 250),
})
```

### `throttle`

Wrap a handler so it cannot run more often than the configured interval.

```ts
const Connected = state({
  Tick: throttle((_data, _payload, { trigger }) => {
    trigger(sync())
  }, 1000),
})
```

### `switch_`

Pattern-match on the current state value.

```ts
const label = switch_(runtime.currentState())
  .case_(Idle, () => "idle")
  .case_(Saving, data => `saving ${data.id}`)
  .run()
```

### `whichTimeout`

Build an exhaustive timeout-id matcher.

```ts
type TimeoutId = "autosave" | "banner"

const Editing = state<Enter, { saved: boolean }, TimeoutId>({
  TimerCompleted: whichTimeout<TimeoutId>({
    autosave: (data, _payload, { update }) => update({ ...data, saved: true }),
    banner: () => undefined,
  }),
})
```

Timer behavior is covered in [Timers](./timers.md).

### `whichInterval`

Build an exhaustive interval-id matcher.

```ts
type IntervalId = "presence" | "sync"

const Connected = state<Enter, { ticks: number }, never, IntervalId>({
  IntervalTriggered: whichInterval<IntervalId>({
    presence: (data, _payload, { update }) =>
      update({ ...data, ticks: data.ticks + 1 }),
    sync: data => data,
  }),
})
```

Interval and frame behavior is covered in [Intervals And Frames](./intervals.md).

### `waitState`

Create a state that emits a request action on entry and waits for a matching response action.

```ts
const LoadProfile = waitState(
  loadProfile,
  profileLoaded,
  (data, payload) => Ready({ ...data, profile: payload }),
  { name: "LoadProfile", timeout: 5000 },
)
```

## Type Guards

### `isEffect`

Type guard for effect values.

```ts
if (isEffect(value)) {
  console.log(value.label)
}
```

### `isStateTransition`

Type guard for compiled state transitions.

```ts
if (isStateTransition(value)) {
  console.log(value.name)
}
```
