# Architecture

Fizz models a workflow as explicit state transitions. Instead of spreading logic across callbacks, component effects, timers, and request handlers, you describe how a current state responds to an action and what work should happen next.

At a high level, a single transition step looks like this:

1. the runtime receives an action
2. the current state chooses a handler by action type
3. the handler returns transitions, outputs, and effects
4. the runtime applies those returns in order
5. the machine becomes ready for the next action

```text
Runtime transition cycle

[Action arrives]
  |
  v
[Select handler]
  |
  v
[Handler returns work]
  |
  v
[Apply transitions / outputs / effects]
  |
  v
[Next current state is ready]
  |
  +---- waits for the next action ----+
             |
             v
            [Action arrives]
```

## The core pieces

### States

A Fizz state is a mapping from action names to handlers.

```typescript
import { Enter, action, state } from "@tdreyno/fizz"

const save = action("Save").withPayload<{ content: string }>()

type Data = {
  content: string
}

const Editing = state<Enter | ReturnType<typeof save>, Data>({
  Enter: () => undefined,
  Save: (data, payload, { update }) =>
    update({
      ...data,
      content: payload.content,
    }),
})
```

The state definition is where the workflow lives. When you need a different mode, you transition to a different state instead of layering more flags onto one giant handler map.

### Actions

Actions are explicit events. They are values, not method names hidden inside callbacks.

```typescript
const save = action("Save").withPayload<{ content: string }>()
const cancel = action("Cancel")
```

This makes the machine easier to read and easier to test because every transition starts from a named action.

Fizz also generates lifecycle actions for scheduled work:

- timers: `TimerStarted`, `TimerCompleted`, `TimerCancelled`
- intervals: `IntervalStarted`, `IntervalTriggered`, `IntervalCancelled`
- async cancellation: `AsyncCancelled`
- frame loops: `OnFrame`

Those lifecycle actions are regular state inputs. They do not require a separate callback system.

### Data and context

Each bound state carries serializable data. That data is the machine-owned snapshot for the current state.

Handlers receive three values:

- `data`: the current state's data
- `payload`: the current action payload
- `utils`: helpers such as `update(...)`, `startAsync(...)`, `startTimer(...)`, and related runtime helpers

The runtime itself also holds a `Context`, which tracks state history and runtime options such as logging configuration. Most application logic should care about state data, not the runtime context internals.

### Transitions

Handlers return work instead of performing every side effect inline.

Common return values are:

- `update(nextData)` to stay in the same state
- `OtherState(nextData)` to transition to a different state
- `output(action)` to emit an action to the integration layer
- an effect such as `startAsync(...)`, `startTimer(...)`, or a custom `effect(...)`
- an array when one transition needs multiple results

This keeps the machine deterministic at decision time: given the same state data and the same action, you can see the intended next work in one place.

```text
Handler return shapes

handler(action, data)
  |
  +--> update(nextData) ----------> stay in same state
  |
  +--> OtherState(nextData) ------> move to another state
  |
  +--> output(action) ------------> notify integration layer
  |
  +--> effect(...) ---------------> runtime performs side effect
  |
  +--> [ ...many returns... ] ----> runtime applies each in order
```

## Effects versus outputs

Fizz uses two related but different concepts when a transition needs to touch the outside world.

### Outputs

`output(action)` emits an action to the runtime's output subscribers.

Use it when the machine wants to tell another layer that something happened, for example:

- analytics should record an event
- a UI host should open a modal
- an adapter should start a request outside the machine

Outputs are integration-facing. They are especially useful when you want the machine to stay pure about coordination while another layer decides how to react.

### Effects

Effects represent work the runtime should perform after the state transition is chosen.

Built-in examples include:

- `startAsync(...)`
- `cancelAsync(...)`
- `startTimer(...)`
- `startInterval(...)`
- `startFrame()`
- `goBack()`
- `log(...)`, `warn(...)`, `error(...)`

The runtime understands some effect labels specially, such as `startTimer` or `output`. Any other custom effect label falls through to the effect executor you provide with `effect(...)`.

```text
Decision boundary

state handler
  |
  +--> returns output(action) -----> subscribers react outside the machine
  |
  +--> returns effect(...) --------> runtime executes effect after the decision
  |
  +--> returns state transition ----> runtime updates current state
```

## A complete step

This is the architectural shape to keep in mind when reading any Fizz machine:

```typescript
import { Enter, action, output, state } from "@tdreyno/fizz"

const submit = action("Submit")
const submitted = action("Submitted")

type Data = {
  status: "editing" | "saving"
}

const Editing = state<Enter | ReturnType<typeof submit>, Data>({
  Enter: (data, _, { update }) => update(data),

  Submit: (data, _, { update }) => [
    update({
      ...data,
      status: "saving",
    }),
    output(submitted()),
  ],
})
```

When `Submit` arrives:

1. the runtime selects `Editing.Submit`
2. the handler returns updated state data plus an output
3. the runtime applies the state update
4. the runtime emits the output to subscribers

```text
Complete step for Submit

Submit
  |
  v
Editing.Submit
  |
  +--> update({ status: "saving" })
  |
  +--> output(submitted())
        |
        v
runtime applies state update first
        |
        v
runtime emits Submitted to output listeners
```

Nothing about that step requires hidden callbacks or external mutable bookkeeping.

## How complexity stays manageable

When a machine grows, the main tools are structural rather than magical:

- split different modes into separate states
- use a nested state machine when one parent mode owns a smaller workflow with a clear boundary
- use a parallel machine when several child workflows stay active together and should share a broadcast action surface
- keep action names explicit
- keep handlers focused on one transition step
- use lifecycle actions from async and scheduling helpers instead of custom callback plumbing
- use `whichTimeout(...)` and `whichInterval(...)` when scheduled actions branch by id
- use `debounce(...)` and `throttle(...)` around individual handlers or branches when that behavior belongs to the machine

If a single state starts collecting unrelated action families, the right move is often another state, not another layer of indirection.

See [Nested State Machines](./nested-state-machines.md) when one state should own a child workflow instead of flattening every step into the top-level machine.
See [Parallel State Machines](./parallel-state-machines.md) when a parent needs multiple active child machines instead of one nested child runtime.

## Where custom effects fit

Most app code should start with the built-in helpers. Reach for a custom effect when you need behavior that does not naturally fit:

- output emission
- async request helpers
- timers, intervals, or frame loops

Examples include clipboard access, local storage writes, analytics beacons, or host-specific commands.

See [Custom Effects](./custom-effects.md) for the public `effect(...)` primitive and guidance on when to use it.

## React Integration

When you are using React, `useMachine(...)` from `@tdreyno/fizz-react` hosts the runtime lifecycle for you and exposes `currentState`, `actions`, `context`, and `runtime` back to the component.

See [React Integration](./react-integration.md) for the hook parameters, return shape, bound action behavior, and component guidance.

## Related Docs

- [Getting Started](./getting-started.md)
- [React Integration](./react-integration.md)
- [Custom Effects](./custom-effects.md)
- [Complex Actions](./complex-actions.md)
- [Nested State Machines](./nested-state-machines.md)
- [Parallel State Machines](./parallel-state-machines.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [Testing](./testing.md)
