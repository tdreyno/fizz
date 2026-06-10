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

`whichTimeout(...)` and `whichInterval(...)` are useful when scheduled actions branch by id and you want branch-level type narrowing. Branches are optional: a timer or interval id with no matching branch resolves to `undefined` (a no-op).

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

## Guarded routing with route()

A common cause of a hard-to-read handler is one that does nothing but pick the next state. An `Enter` handler that walks through a sequence of `if` checks — empty cart, has a coupon, otherwise ready — is really a decision node hiding inside imperative code. The `route()` builder makes that decision explicit and ordered.

`route()` returns a value that is itself a state handler, so it drops straight into any handler slot. Branches are evaluated top to bottom and the first matching predicate wins; if nothing matches and there is no `otherwise`, the machine stays put.

```typescript
import { log, route, state } from "@tdreyno/fizz"

type CartData = { items: number; coupon?: string }

const Cart = state<typeof enter, CartData>({
  Enter: route<CartData>()
    .when(data => data.items === 0, EmptyCart)
    .when(
      data => data.coupon != null,
      data => [log("coupon applied"), Discounted(data)],
    )
    .otherwise(ReadyToPay),
})
```

```text
Enter(Cart)
   │
   ├─ items === 0 ───────────► EmptyCart
   ├─ coupon != null ───────► log + Discounted
   └─ otherwise ─────────────► ReadyToPay
```

Each branch's target receives `(data, payload, utils)`, so a target can return a plain transition, a bare `BoundStateFn`, an effect/action array, a bare data value (an implicit update), or a promise. A predicate can also be a TypeScript type guard, which narrows the target's `data` for that branch only.

The same handler shape works for guarded transitions on a real event, reading the action payload:

```typescript
const Editing = state<Submit, FormData>({
  Submit: route<FormData, { force: boolean }>()
    .when((data, payload) => !payload.force && data.dirty, ConfirmDiscard)
    .otherwise(Saved),
})
```

This is distinct from two nearby tools. The fluent state `.when(...)` guard (see [Fluent API](./fluent-api.md)) attaches a guard to a single state definition, while `switch_(...)` keys on which state you are in and returns a value. `route()` keys on predicates over `data`/`payload` and produces the next transition. Reach for `route()` when a single handler's only job is to choose where to go next.

For tooling, `getRouteMetadata(routeValue)` returns the ordered branch descriptors (each with a `label` and an `otherwise` flag).

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
- [Fluent API](./fluent-api.md)
- [Output Actions](./output-actions.md)
- [Nested State Machines](./nested-state-machines.md)
- [Custom Effects](./custom-effects.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
