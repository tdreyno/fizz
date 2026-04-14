# Timers

Fizz timers let a state schedule a future action without leaving the state machine model. You start, restart, or cancel a timer from a state handler, and the runtime feeds the timer lifecycle back into the same state as regular actions.

Timers are a good fit for delayed transitions, debounced handlers, autosave, and temporary UI state such as dismissing a banner after a delay.

## How timers work

Declare a timer id union as the third generic parameter to `state(...)`. Once you do that, Fizz adds three helper functions to the handler utils:

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

If a state uses both timers and intervals, you can keep their id spaces separate by passing an interval id union as the fourth generic parameter:

```typescript
type TimeoutId = "autosave" | "flashSaved"
type IntervalId = "heartbeat" | "sync"

const Editing = state<Enter, Data, TimeoutId, IntervalId>({
  Enter: (_, __, { startTimer, startInterval }) => [
    startTimer("autosave", 1000),
    startInterval("heartbeat", 5000),
  ],
})
```

With that shape, timer helpers only accept `TimeoutId` values and interval helpers only accept `IntervalId` values.

## Basic example

This example starts a timer when the state is entered and transitions once the timer completes.

```typescript
import { Enter, noop, state, whichTimeout } from "@tdreyno/fizz"

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

    TimerCompleted: whichTimeout<TimeoutId>({
      autosave: (data, payload) => {
        const timeoutId: "autosave" = payload.timeoutId

        return Done(appendEvent(data, `completed:${timeoutId}`))
      },
    }),
  },
  { name: "Editing" },
)
```

The important part is that `TimerCompleted` is handled inside the same state definition. You do not wire a separate callback system into the runtime. `whichTimeout(...)` is exhaustive over the declared timer id union, so every timer id must be handled.

## Matching with `whichTimeout`

Use `whichTimeout(...)` when a timer handler needs different behavior for different timer ids and you want exhaustiveness plus branch-level narrowing without manual `if` or `switch` statements.

```typescript
import { Enter, state, whichTimeout } from "@tdreyno/fizz"

type TimeoutId = "autosave" | "flashSaved"

type Data = {
  saved: boolean
  bannerVisible: boolean
}

const Editing = state<Enter, Data, TimeoutId>({
  Enter: (_, __, { startTimer }) => [
    startTimer("autosave", 1000),
    startTimer("flashSaved", 300),
  ],

  TimerCompleted: whichTimeout<TimeoutId>({
    autosave: (data, payload, { update }) => {
      const timeoutId: "autosave" = payload.timeoutId

      return update({
        ...data,
        saved: timeoutId === "autosave" ? true : data.saved,
      })
    },

    flashSaved: (data, payload, { update }) => {
      const timeoutId: "flashSaved" = payload.timeoutId

      return update({
        ...data,
        bannerVisible: timeoutId === "flashSaved" ? false : data.bannerVisible,
      })
    },
  }),
})
```

`whichTimeout(...)` guarantees three things:

- The handler map is exhaustive for the declared `TimeoutId` union.
- Each branch narrows `payload.timeoutId` to its specific timer id.
- The returned function plugs directly into timer handlers such as `TimerCompleted`.

Use `whichTimeout<TimeoutId>({...})` directly, even when the surrounding state also declares a separate interval-id union.

## Debouncing handlers

Use `debounce(...)` when you want to delay a handler body until calls stop for a given window. The short form is the default: pass the delay as the second argument.

```typescript
import { Enter, debounce, state, whichTimeout } from "@tdreyno/fizz"

type TimeoutId = "autosave" | "flashSaved"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const Editing = state<Enter, Data, TimeoutId>({
  Enter: (data, _, { startTimer, update }) => [
    update(appendEvent(data, "enter")),
    startTimer("autosave", 1000),
    startTimer("flashSaved", 300),
  ],

  TimerCompleted: whichTimeout<TimeoutId>({
    autosave: debounce((data, payload, { update }) => {
      const timeoutId: "autosave" = payload.timeoutId

      return update(appendEvent(data, `debounced:${timeoutId}`))
    }, 300),

    flashSaved: (data, payload, { update }) => {
      const timeoutId: "flashSaved" = payload.timeoutId

      return update(appendEvent(data, `completed:${timeoutId}`))
    },
  }),
})
```

The wrapper is attached to the individual branch, not the whole `whichTimeout(...)` matcher. Each wrapped branch keeps its own debounce state.

If you need the long form, `debounce(handler, { delay: 300 })` is equivalent to `debounce(handler, 300)`.

## Throttling handlers

Use `throttle(...)` when a handler should run at most once per window. The short form is `throttle(handler, 1000)`. If you need lodash-style options such as `leading` or `trailing`, use the object form.

```typescript
import { createAction, throttle, state } from "@tdreyno/fizz"

const save = createAction<"Save", { content: string }>("Save")

type Save = ReturnType<typeof save>

type Data = {
  content: string
  saveCount: number
}

const Editing = state<Save, Data>({
  Save: throttle(
    (data, { content }, { update }) =>
      update({
        ...data,
        content,
        saveCount: data.saveCount + 1,
      }),
    1000,
  ),
})
```

## Manual debounce with `restartTimer`

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
import { Enter, state, whichTimeout } from "@tdreyno/fizz"

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

    TimerCompleted: whichTimeout<TimeoutId>({
      flashSaved: (data, payload, { update }) => {
        const timeoutId: "flashSaved" = payload.timeoutId

        return update({
          ...data,
          bannerStatus:
            timeoutId === "flashSaved" ? "fading" : data.bannerStatus,
        })
      },

      dismissBanner: (data, payload, { update }) => {
        const timeoutId: "dismissBanner" = payload.timeoutId

        return update({
          ...data,
          bannerVisible:
            timeoutId === "dismissBanner" ? false : data.bannerVisible,
          bannerStatus: "hidden",
        })
      },
    }),
  },
  { name: "Notification" },
)
```

The `timeoutId` value is narrowed to the declared timer-id member in each branch, so TypeScript will reject unknown ids and missing handlers.

## Behavior notes

- `restartTimer` cancels an active timer before starting the replacement timer.
- `cancelTimer` is a no-op if that timer is not currently running.
- When a state transition leaves the current state, Fizz clears any active timers owned by that state.
- Timer actions are available automatically once the state declares a `TimeoutId` generic.
