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

## Parser and map pipeline

```typescript
import * as z from "zod"

import { Enter, action, customJSONAsync, state } from "@tdreyno/fizz"

const Profile = z.object({
  id: z.string(),
  name: z.string(),
})

const profileNameLoaded = action("ProfileNameLoaded").withPayload<string>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state({
  Enter: (_, __, { context }) =>
    customJSONAsync(signal =>
      context.apiClient.getProfile({
        signal,
        userId: context.userId,
      }),
    )
      .validate(Profile.parse)
      .map(profile => profile.name)
      .chainToAction(profileNameLoaded, error => profileFailed(String(error))),
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

## React integration with browser driver

Import browser runtime drivers from `@tdreyno/fizz/browser`.

```typescript
import { browserDriver } from "@tdreyno/fizz/browser"
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine(FlowMachine, FlowMachine.states.Ready(), {
  driver: browserDriver,
})
```

## Confirm flow with dedicated state

```typescript
import { action, confirm, createMachine, state } from "@tdreyno/fizz"

const requestDelete = action("RequestDelete")

const Ready = state({
  RequestDelete: data => ConfirmingDelete(data),
})

const ConfirmingDelete = state({
  Enter: () => confirm("Delete item?"),
  ConfirmAccepted: data => Deleting(data),
  ConfirmRejected: data => Ready(data),
})

const Deleting = state({
  Enter: data => Ready({ ...data, deleted: true }),
})

const machine = createMachine({
  actions: { requestDelete },
  states: { ConfirmingDelete, Deleting, Ready },
})
```

## Prompt flow with dedicated state

```typescript
import { prompt, state } from "@tdreyno/fizz"

const PromptingName = state({
  Enter: () => prompt("Name"),
  PromptSubmitted: (data, value, { update }) =>
    update({ ...data, name: value }),
  PromptCancelled: (data, _payload, { update }) => update(data),
})
```

## Fire-and-forget browser effects

```typescript
import {
  alert,
  copyToClipboard,
  openUrl,
  printPage,
  state,
} from "@tdreyno/fizz"

const Ready = state({
  CopyLink: () => copyToClipboard("https://example.com"),
  OpenDocs: () => openUrl("https://docs.example.com", "_blank"),
  Print: () => printPage(),
  Saved: () => alert("Saved"),
})
```

## History and location singleton resources

```typescript
import { historyPushState, locationSetHash, state } from "@tdreyno/fizz"
import { dom } from "@tdreyno/fizz/browser"

const Browsing = state({
  Enter: () => dom.history().listen("popstate", didPopState),
  HashListening: () => dom.location().listen("hashchange", didHashChange),
  GoToProfile: () => historyPushState({ page: "profile" }, "/profile"),
  JumpToSection: () => locationSetHash("#details"),
})
```

## Colocated selector with `selectWhen(...)`

```typescript
import { createMachine, selectWhen } from "@tdreyno/fizz"

const machine = createMachine({
  selectors: {
    isEditable: selectWhen(Editing, data => !data.readOnly),
    hasInteractiveLabel: selectWhen([Editing, Reviewing] as const, {
      label: "Interactive",
    }),
  },
  states: { Editing, Viewing },
})
```

## Complex selector matching with `ts-pattern`

```typescript
import { createMachine, selectWhen } from "@tdreyno/fizz"
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

## React derived rendering with `machine.selectors`

```typescript
const machineValue = useMachine(machine, machine.states.Viewing())
const isEditable = machineValue.selectors.isEditable
```

## Optimized render skipping with `useSelector(...)`

```typescript
const machine = useMachine(
  machineDefinition,
  machineDefinition.states.Viewing(),
  {
    disableAutoSelectors: true,
  },
)

const isEditable = useSelector(
  machine,
  snapshot => snapshot.selectors.isEditable,
)
```

Use this opt-out path when render skipping is more important than simple direct reads.

## Core runtime selector evaluation (non-React)

```typescript
import {
  createRuntime,
  enter,
  runStateSelector,
  selectWhen,
  createMachine,
} from "@tdreyno/fizz"

const EditorMachine = createMachine({
  selectors: {
    isEditable: selectWhen(Editing, data => !data.readOnly),
  },
  states: { Editing, Viewing },
})

const runtime = createRuntime(EditorMachine, EditorMachine.states.Viewing())

await runtime.run(enter())

const isEditable = runStateSelector(
  EditorMachine.selectors.isEditable,
  runtime.currentState(),
  runtime.context,
)
```

## Parallel machine composition

```typescript
import {
  action,
  createMachine,
  createParallelMachine,
  createRuntime,
  enter,
  state,
} from "@tdreyno/fizz"

const refresh = action("Refresh")

const LeftIdle = state({
  Enter: () => undefined,
  Refresh: () => LeftReady(),
})

const LeftReady = state({
  Enter: () => undefined,
})

const LeftMachine = createMachine({
  actions: { refresh },
  initialState: LeftIdle(),
  states: { LeftIdle, LeftReady },
})

const RightIdle = state({
  Enter: () => undefined,
  Refresh: () => RightReady(),
})

const RightReady = state({
  Enter: () => undefined,
})

const RightMachine = createMachine({
  actions: { refresh },
  initialState: RightIdle(),
  states: { RightIdle, RightReady },
})

const parallel = createParallelMachine({
  left: LeftMachine.withInitialState(LeftIdle()),
  right: RightMachine.withInitialState(RightReady()),
})

const runtime = createRuntime(parallel.machine, parallel.initialState)

await runtime.run(enter())
await runtime.run(parallel.actions.refresh())
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
