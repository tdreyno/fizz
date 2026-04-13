# Timers

Fizz timers let a state schedule a future action without leaving the state machine model. You start, restart, or cancel a timer from a state handler, and the runtime feeds the timer lifecycle back into the same state as regular actions.

Timers are a good fit for delayed transitions, debounce behavior, autosave, and temporary UI state such as dismissing a banner after a delay.

## How timers work

Declare a timeout id union as the third generic parameter to `state(...)`. Once you do that, Fizz adds three helper functions to the handler utils:

- `startTimer(timeoutId, delay)`
- `cancelTimer(timeoutId)`
- `restartTimer(timeoutId, delay)`

Fizz also makes three timer actions available to the state automatically:

- `TimerStarted`
- `TimerCompleted`
- `TimerCancelled`

Each action carries the same payload shape:

```typescript
{
  timeoutId: "your-timeout-id"
  delay: 3000
}
```

## Basic example

This example starts a timer when the state is entered and transitions once the timer completes.

```typescript
import { Enter, noop, state } from "@tdreyno/fizz"

type TimeoutId = "autosave"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const Done = state<Enter, Data>(
  {
    Enter: noop,
  },
  { name: "Done" },
)

const Editing = state<Enter, Data, TimeoutId>(
  {
    Enter: (data, _, { startTimer, update }) => [
      update(appendEvent(data, "enter")),
      startTimer("autosave", 1000),
    ],

    TimerStarted: (data, { timeoutId }, { update }) => {
      return update(appendEvent(data, `started:${timeoutId}`))
    },

    TimerCompleted: (data, { timeoutId }) => {
      if (timeoutId === "autosave") {
        return Done(appendEvent(data, "completed:autosave"))
      }
    },
  },
  { name: "Editing" },
)
```

The important part is that `TimerCompleted` is handled inside the same state definition. You do not wire a separate callback system into the runtime.

## Debouncing with `restartTimer`

`restartTimer` is the usual choice when you want debounce behavior. If the timer is already running, Fizz cancels it first and starts a fresh one with the new delay.

```typescript
import { ActionCreatorType, createAction, state } from "@tdreyno/fizz"

const save = createAction<"Save", { content: string }>("Save")
type Save = ActionCreatorType<typeof save>

type TimeoutId = "autosave"

type EditorData = {
  content: string
  status: "idle" | "dirty" | "saved"
}

const Editing = state<Save, EditorData, TimeoutId>(
  {
    Save: (data, { content }, { restartTimer, update }) => [
      update({ ...data, content, status: "dirty" }),
      restartTimer("autosave", 3000),
    ],

    TimerCompleted: (data, { timeoutId }, { update }) => {
      if (timeoutId !== "autosave") {
        return
      }

      return update({ ...data, status: "saved" })
    },
  },
  { name: "Editing" },
)
```

Every `Save` action resets the clock. The autosave only happens after three seconds of inactivity.

## Multiple timers in one state

Timer ids are type-safe, so a single state can coordinate more than one delay without falling back to stringly typed conventions.

```typescript
import { Enter, state } from "@tdreyno/fizz"

type TimeoutId = "flashSaved" | "dismissBanner"

type Data = {
  bannerVisible: boolean
  bannerStatus: "hidden" | "visible" | "fading"
}

const Notification = state<Enter, Data, TimeoutId>(
  {
    Enter: (data, _, { startTimer, update }) => [
      update({ ...data, bannerVisible: true, bannerStatus: "visible" }),
      startTimer("flashSaved", 300),
      startTimer("dismissBanner", 3000),
    ],

    TimerCompleted: (data, { timeoutId }, { update }) => {
      if (timeoutId === "flashSaved") {
        return update({ ...data, bannerStatus: "fading" })
      }

      return update({ ...data, bannerVisible: false, bannerStatus: "hidden" })
    },
  },
  { name: "Notification" },
)
```

The `timeoutId` value is narrowed to the declared union, so TypeScript will reject unknown ids.

## Testing timers

Use `createControlledTimerDriver()` when you want deterministic tests. It lets you advance the runtime clock explicitly instead of waiting for real time.

```typescript
import {
  Enter,
  createControlledTimerDriver,
  createInitialContext,
  createRuntime,
  enter,
  isState,
  state,
} from "@tdreyno/fizz"

type TimeoutId = "autosave"

const Editing = state<Enter, { completed: boolean }, TimeoutId>({
  Enter: (_, __, { startTimer }) => startTimer("autosave", 50),

  TimerCompleted: (data, _, { update }) =>
    update({
      ...data,
      completed: true,
    }),
})

const timerDriver = createControlledTimerDriver()
const context = createInitialContext([Editing({ completed: false })])
const runtime = createRuntime(context, {}, {}, { timerDriver })

await runtime.run(enter())
await timerDriver.advanceBy(50)

const currentState = runtime.currentState()

if (isState(currentState, Editing)) {
  currentState.data.completed
}
```

This keeps timer tests fast and stable, and it mirrors how the runtime timer behavior is tested in the Fizz package itself.

## Behavior notes

- `restartTimer` cancels an active timer before starting the replacement timer.
- `cancelTimer` is a no-op if that timer is not currently running.
- When a state transition leaves the current state, Fizz clears any active timers owned by that state.
- Timer actions are available automatically once the state declares a `TimeoutId` generic.

## Reference

Timers are exposed through the main package exports:

```typescript
import {
  cancelTimer,
  restartTimer,
  startTimer,
  timerCancelled,
  timerCompleted,
  timerStarted,
} from "@tdreyno/fizz"
```

In most state-machine code, you will use the helper functions injected into the state handler utils rather than calling the effect creators directly.
