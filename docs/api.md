# API

This page documents the core `@tdreyno/fizz` APIs intended for everyday machine authoring. It focuses on the root exports you use to define actions, states, effects, and runtimes.

Dedicated guides already cover the deeper scheduling and testing APIs:

- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals And Frames](./intervals.md)
- [Testing](./testing.md)

## Machines

### `createMachine`

Create an explicit machine root that groups your top-level states, actions, and optional output actions in one value. Pass an optional second `name` argument when you want a stable machine name for CLI discovery, logging, or debugging.

```ts
const EditorMachine = createMachine(
  {
    actions: { saveDraft, startEditing },
    outputActions: { draftSaved },
    states: { Editing, Idle },
  },
  "EditorMachine",
)
```

Use `createMachine(...)` when you want one stable root for integrations, examples, or CLI discovery. The CLI only discovers default-exported machine roots created this way.

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
const context = createInitialContext([Initial()])
const runtime = createRuntime(context, actions, outputActions)

await runtime.run(enter())
```

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
