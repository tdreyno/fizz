# Custom Effects

Fizz already ships built-in helpers for common side-effect shapes such as async requests, timers, intervals, frame loops, logging, and outputs. This page is about the lower-level escape hatch: building your own effect with `effect(...)`.

Use a custom effect when the machine should request work that does not fit the built-in helpers cleanly, such as:

- local storage writes
- clipboard access
- analytics beacons
- browser navigation adapters
- host-specific integration commands

## The effect primitive

The public shape is:

```typescript
effect(label, data?, executor?)
```

An `Effect` instance carries three things:

- `label`: a stable name for the effect
- `data`: serializable metadata for the effect
- `executor`: the function the runtime will call after the transition is chosen

```typescript
import { effect } from "@tdreyno/fizz"

const trackEvent = (name: string, properties: Record<string, unknown>) =>
  effect("trackEvent", { name, properties }, () => {
    window.analytics?.track(name, properties)
  })
```

The handler returns `trackEvent(...)`. The runtime decides when to execute it.

## Keep declaration pure

The important rule is that the handler should construct the effect, not perform the side effect immediately.

Good:

```typescript
const saveDraftToStorage = (draft: string) =>
  effect("saveDraftToStorage", { draft }, () => {
    localStorage.setItem("draft", draft)
  })
```

Avoid:

```typescript
const saveDraftToStorage = (draft: string) => {
  localStorage.setItem("draft", draft)
  return effect("saveDraftToStorage", { draft })
}
```

The first shape preserves the machine's decision step. The second leaks side effects into machine construction.

## Built-in labels versus custom labels

Fizz treats several labels as built-in runtime commands, including:

- `output`
- `startAsync`
- `cancelAsync`
- `startTimer`
- `cancelTimer`
- `restartTimer`
- `startInterval`
- `cancelInterval`
- `restartInterval`
- `startFrame`
- `cancelFrame`
- `goBack`

Those are intercepted by the runtime's effect dispatcher.

Any other label is treated as a normal custom effect, and the runtime runs the provided executor.

That means the label should be descriptive and stable. It is not just documentation. It is the machine-readable name of the effect.

## What the executor receives

The executor receives the runtime `Context`.

That context exposes:

- `history`
- `currentState`
- logging configuration such as `enableLogging` and `customLogger`

For most custom effects, the closure over `data` is enough. Use the runtime context only when the effect genuinely needs runtime-level information.

```typescript
import { effect } from "@tdreyno/fizz"

const reportState = () =>
  effect("reportState", undefined, context => {
    console.log(context.currentState.name)
  })
```

## A realistic example

This example records an analytics event when a profile save succeeds.

```typescript
import { ActionCreatorType, Enter, action, effect, state } from "@tdreyno/fizz"

const profileSaved = action("ProfileSaved").withPayload<{ id: string }>()
type ProfileSaved = ActionCreatorType<typeof profileSaved>

type Data = {
  profileId?: string
}

const trackProfileSaved = (profileId: string) =>
  effect("trackProfileSaved", { profileId }, () => {
    window.analytics?.track("profile_saved", { profileId })
  })

const Editing = state<Enter | ProfileSaved, Data>({
  Enter: () => undefined,

  ProfileSaved: (data, payload, { update }) => [
    update({
      ...data,
      profileId: payload.id,
    }),
    trackProfileSaved(payload.id),
  ],
})
```

The state decides what should happen. The effect executor performs the external work after that decision.

## Choosing the right tool

Use `output(...)` when:

- another layer should decide how to handle the event
- you want subscribers to react through `runtime.onOutput(...)`

Use `startAsync(...)` or `requestJSONAsync(...)` when:

- the work is promise-shaped
- the result should map back into machine actions
- cancellation and stale-completion handling matter

Use timers, intervals, or frame helpers when:

- the work is fundamentally scheduling-oriented

Use a custom `effect(...)` when:

- the work is not naturally modeled by the built-in helpers
- you want a named, inspectable side-effect request attached to the transition

## Testing custom effects

Because custom effects are values, the machine logic stays straightforward to test. In many cases, the useful assertion is not that the browser API ran, but that the state returned the effect with the expected label and data.

If you need to verify the executor behavior too, do that at the runtime or adapter layer where the effect actually runs.

## Related Docs

- [Architecture](./architecture.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Testing](./testing.md)
