# Examples

Short copyable examples for common Fizz and fizz-react tasks.

## Simple state transition

```typescript
import { Enter, action, state } from "@tdreyno/fizz"

const finish = action("Finish")

const Start = state<Enter | ReturnType<typeof finish>>({
  Enter: () => undefined,
  Finish: () => Done(),
})

const Done = state<Enter>({
  Enter: () => undefined,
})
```

## Runtime bootstrapping

```typescript
import { createInitialContext, createRuntime, enter } from "@tdreyno/fizz"

const context = createInitialContext([Start()])
const runtime = createRuntime(context, { finish }, {})

await runtime.run(enter())
```

## Machine-first setup with `createMachine(...)`

```typescript
import { createMachine, createRuntime, enter } from "@tdreyno/fizz"

const machine = createMachine({
  initialState: Start(),
  states: { Start, Done },
  actions: { finish },
})

const runtime = createRuntime(machine, machine.states.Start())

await runtime.run(enter())
```

## JSON request mapped back into actions

```typescript
import { Enter, action, requestJSONAsync, state } from "@tdreyno/fizz"

type Profile = {
  id: string
}

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state({
  Enter: () =>
    requestJSONAsync("/api/profile", { asyncId: "profile" })
      .validate(assertProfile)
      .chainToAction(profileLoaded, error => profileFailed(String(error))),
})
```

## App client JSON call mapped back into actions

```typescript
import { Enter, action, customJSONAsync, state } from "@tdreyno/fizz"

type Profile = {
  id: string
}

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state({
  Enter: (_, __, { context }) =>
    customJSONAsync(
      signal =>
        context.openApiClient.getProfile({
          signal,
          userId: context.userId,
        }),
      { asyncId: "profile" },
    )
      .validate(assertProfile)
      .chainToAction(profileLoaded, error => profileFailed(String(error))),
})
```

## Debounced and throttled handlers

```typescript
import { action, debounce, state, throttle } from "@tdreyno/fizz"

const QueryChanged = action("QueryChanged").withPayload<string>()
const SaveDraft = action("SaveDraft")

const Editing = state<
  ReturnType<typeof QueryChanged> | ReturnType<typeof SaveDraft>
>({
  QueryChanged: debounce((data, payload, { update }) => {
    return update({ ...data, query: payload })
  }, 200),
  SaveDraft: throttle(
    (data, _payload, { update }) => {
      return update({ ...data, saves: data.saves + 1 })
    },
    { delay: 1000, leading: true, trailing: true },
  ),
})
```

## `waitState(...)` request-response pattern

```typescript
import { action, waitState } from "@tdreyno/fizz"

const loadProfile = action("LoadProfile")
const profileLoaded = action("ProfileLoaded").withPayload<{ id: string }>()

const Loading = waitState(
  loadProfile,
  profileLoaded,
  (data, payload) => Ready({ ...data, profile: payload }),
  { name: "LoadingProfile", timeout: 5000 },
)
```

## `switch_`, `whichTimeout`, and `whichInterval`

```typescript
import { switch_, whichInterval, whichTimeout } from "@tdreyno/fizz"

const label = switch_(runtime.currentState())
  .case_(Idle, () => "idle")
  .case_(Saving, () => "saving")
  .run()

const onTimer = whichTimeout<"autosave" | "banner">({
  autosave: (data, _payload, { update }) => update({ ...data, saved: true }),
  banner: () => undefined,
})

const onInterval = whichInterval<"presence" | "sync">({
  presence: (data, _payload, { update }) =>
    update({ ...data, ticks: data.ticks + 1 }),
  sync: () => undefined,
})
```

## React integration with `useMachine(...)`

```typescript
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine(FlowMachine, FlowMachine.states.Start())

const current = machine.currentState
const isDone = machine.currentState.is(machine.states.Done)
```

## Shared runtime with `createMachineContext(...)`

```typescript
import { createMachineContext } from "@tdreyno/fizz-react"

const { Provider, useMachineContext } = createMachineContext(FlowMachine)
```

## Practical reminders

- Prefer explicit action names.
- Keep handlers readable.
- Use Fizz helpers for async and timing behavior.
- Let React render the machine instead of re-implementing it.
