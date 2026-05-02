# Complex Actions

Simple Fizz states are easy to read because each action maps to one clear handler. As a machine grows, the challenge is not learning a new abstraction. It is keeping a larger action surface readable.

This guide covers the patterns that keep larger handler maps manageable:

- explicit payload-bearing actions
- branching scheduled lifecycle actions by id
- composing `debounce(...)` and `throttle(...)` around individual handlers
- separating integration outputs from state transitions
- splitting a state when the action surface stops describing one mode of behavior

## Start with explicit action creators

Prefer named action creators over ad hoc string conventions.

```typescript
import { ActionCreatorType, action } from "@tdreyno/fizz"

const save = action("Save").withPayload<{ content: string }>()
const saveFailed = action("SaveFailed").withPayload<{ reason: string }>()
const cancel = action("Cancel")

type Save = ActionCreatorType<typeof save>
type SaveFailed = ActionCreatorType<typeof saveFailed>
type Cancel = ActionCreatorType<typeof cancel>
```

That gives the machine a stable vocabulary and keeps payload types close to the event names they belong to.

## Keep handlers focused

Large action surfaces stay readable when each handler is about one transition step.

```typescript
import { ActionCreatorType, Enter, action, state } from "@tdreyno/fizz"

const fieldChanged = action("FieldChanged").withPayload<{
  name: "firstName" | "lastName"
  value: string
}>()
const submit = action("Submit")

type FieldChanged = ActionCreatorType<typeof fieldChanged>
type Submit = ActionCreatorType<typeof submit>

type Data = {
  firstName: string
  lastName: string
  status: "editing" | "saving"
}

const Editing = state<Enter | FieldChanged | Submit, Data>({
  Enter: (_, __, { update }) =>
    update({
      firstName: "",
      lastName: "",
      status: "editing",
    }),

  FieldChanged: (data, payload, { update }) =>
    update({
      ...data,
      [payload.name]: payload.value,
    }),

  Submit: (data, _, { update }) =>
    update({
      ...data,
      status: "saving",
    }),
})
```

If one handler starts coordinating unrelated concerns, extract helper functions or split the mode into another state.

## Handle runtime lifecycle actions directly

Timers, intervals, and async helpers feed actions back into the same state model. Treat those as normal state inputs.

```typescript
import { Enter, state, whichTimeout } from "@tdreyno/fizz"

type TimeoutId = "autosave" | "dismissBanner"

type Data = {
  saved: boolean
  bannerVisible: boolean
}

const Editing = state<Enter, Data, TimeoutId>({
  Enter: (_, __, { startTimer }) => [
    startTimer("autosave", 1000),
    startTimer("dismissBanner", 3000),
  ],

  TimerCompleted: whichTimeout<TimeoutId>({
    autosave: (data, payload, { update }) => {
      const timeoutId: "autosave" = payload.timeoutId

      return update({
        ...data,
        saved: timeoutId === "autosave" ? true : data.saved,
      })
    },

    dismissBanner: (data, payload, { update }) => {
      const timeoutId: "dismissBanner" = payload.timeoutId

      return update({
        ...data,
        bannerVisible:
          timeoutId === "dismissBanner" ? false : data.bannerVisible,
      })
    },
  }),
})
```

`whichTimeout(...)` and `whichInterval(...)` are useful when scheduled actions branch by id and you want exhaustiveness plus branch-level type narrowing.

## Compose wrappers around individual branches

If one branch should be rate-limited, wrap that branch directly instead of wrapping an unrelated part of the machine.

```typescript
import { ActionCreatorType, action, debounce, state } from "@tdreyno/fizz"

const save = action("Save").withPayload<{ content: string }>()
type Save = ActionCreatorType<typeof save>

type Data = {
  content: string
  saveCount: number
}

const Editing = state<Save, Data>({
  Save: debounce(
    (data, payload, { update }) =>
      update({
        ...data,
        content: payload.content,
        saveCount: data.saveCount + 1,
      }),
    300,
  ),
})
```

The same pattern works inside `whichTimeout(...)` and `whichInterval(...)` branch maps, where each branch keeps its own wrapped runtime state.

## Use outputs to keep integration work separate

When a complex action needs to notify another layer, prefer `output(...)` over direct integration logic in the handler.
When one state repeatedly issues command-style outputs for the same adapter channel, use `commandChannel(...)` so command creation and batching stay concise and consistent.

```typescript
import { ActionCreatorType, action, output, state } from "@tdreyno/fizz"

const submit = action("Submit")
const requestSave = action("RequestSave").withPayload<{ draft: string }>()

type Submit = ActionCreatorType<typeof submit>

type Data = {
  draft: string
}

const Editing = state<Submit, Data>({
  Submit: data => output(requestSave({ draft: data.draft })),
})
```

That keeps the state machine responsible for coordination while adapters decide how to respond to the emitted output.

## When to split the state

Not every large handler map is a problem. The problem is when one state no longer describes one coherent mode.

Consider another state when:

- different actions only make sense under different flags or substates
- handlers are repeatedly branching on `status` before doing real work
- entering or leaving a mode has distinct setup or cleanup behavior
- lifecycle actions from async or scheduling should only exist in one mode

Fizz is easiest to reason about when state boundaries absorb that complexity instead of leaving it inside nested conditionals.

If one parent mode still needs a smaller internal workflow, see [Nested State Machines](./nested-state-machines.md) before flattening everything into one larger handler map.

## Related Docs

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Output Actions](./output-actions.md)
- [Nested State Machines](./nested-state-machines.md)
- [Custom Effects](./custom-effects.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
