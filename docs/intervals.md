# Intervals

Fizz intervals let a state schedule repeating work without leaving the state machine model. You start, restart, or cancel an interval from a state handler, and the runtime feeds the interval lifecycle back into the same state as regular actions.

Intervals are a good fit for polling, periodic refresh, heartbeats, and other recurring work. See [Timers](./timers.md) for one-time delayed actions.

## How intervals work

Declare a timeout id union as the third generic parameter to `state(...)`. Once you do that, Fizz adds three interval helper functions to the handler utils:

- `startInterval(timeoutId, delay)`
- `cancelInterval(timeoutId)`
- `restartInterval(timeoutId, delay)`

Fizz also makes three interval actions available to the state automatically:

- `IntervalStarted`
- `IntervalTriggered`
- `IntervalCancelled`

Each action carries the same payload shape:

```typescript
{
  timeoutId: "your-interval-id"
  delay: 5000
}
```

The important difference from timers is that intervals do not complete. A timer fires once and emits `TimerCompleted`, while an interval keeps emitting `IntervalTriggered` until it is cancelled or the state exits.

## Basic example

This example starts an interval when the state is entered and stops it after three ticks.

```typescript
import { Enter, state } from "@tdreyno/fizz"

type TimeoutId = "healthCheck"

type Data = {
  events: string[]
  tickCount: number
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const Polling = state<Enter, Data, TimeoutId>(
  {
    Enter: (data, _, { startInterval, update }) => [
      update(appendEvent(data, "enter")),
      startInterval("healthCheck", 1000),
    ],

    IntervalStarted: (data, { timeoutId }, { update }) => {
      return update(appendEvent(data, `started:${timeoutId}`))
    },

    IntervalTriggered: (data, { timeoutId }, { cancelInterval, update }) => {
      const nextData = {
        ...appendEvent(data, `triggered:${timeoutId}`),
        tickCount: data.tickCount + 1,
      }

      const nextState = update(nextData)

      return nextData.tickCount >= 3
        ? [nextState, cancelInterval(timeoutId)]
        : nextState
    },

    IntervalCancelled: (data, { timeoutId }, { update }) => {
      return update(appendEvent(data, `cancelled:${timeoutId}`))
    },
  },
  { name: "Polling" },
)
```

This is the core interval pattern: `Enter` starts the schedule, `IntervalTriggered` handles each repetition, and cancellation is explicit.

## Restarting intervals with `restartInterval`

`restartInterval` is useful when you want to replace an active interval with a new cadence. If the interval is already running, Fizz cancels it first and starts a fresh one with the new delay.

```typescript
import { ActionCreatorType, Enter, createAction, state } from "@tdreyno/fizz"

const faster = createAction("Faster")
type Faster = ActionCreatorType<typeof faster>

type TimeoutId = "refresh"

type Data = {
  intervalMs: number
  refreshCount: number
}

const Refreshing = state<Enter | Faster, Data, TimeoutId>(
  {
    Enter: (data, _, { startInterval }) => {
      return startInterval("refresh", data.intervalMs)
    },

    Faster: (data, _, { restartInterval, update }) => {
      const nextIntervalMs = Math.max(250, data.intervalMs - 250)

      return [
        update({
          ...data,
          intervalMs: nextIntervalMs,
        }),
        restartInterval("refresh", nextIntervalMs),
      ]
    },

    IntervalTriggered: (data, _, { update }) => {
      return update({
        ...data,
        refreshCount: data.refreshCount + 1,
      })
    },
  },
  { name: "Refreshing" },
)
```

In the runtime, `restartInterval` behaves like cancel plus start. If the interval is active, the state will see `IntervalCancelled` followed by `IntervalStarted`.

## Multiple intervals in one state

Interval ids are type-safe, so a single state can coordinate more than one repeating schedule.

```typescript
import { Enter, state } from "@tdreyno/fizz"

type TimeoutId = "presence" | "sync"

type Data = {
  lastPresenceTick: number
  lastSyncTick: number
}

const Connected = state<Enter, Data, TimeoutId>(
  {
    Enter: (_, __, { startInterval }) => [
      startInterval("presence", 5000),
      startInterval("sync", 30000),
    ],

    IntervalTriggered: (data, { timeoutId }, { update }) => {
      if (timeoutId === "presence") {
        return update({
          ...data,
          lastPresenceTick: Date.now(),
        })
      }

      return update({
        ...data,
        lastSyncTick: Date.now(),
      })
    },
  },
  { name: "Connected" },
)
```

The `timeoutId` value is narrowed to the declared union, so TypeScript will reject unknown ids.

## Testing intervals

Use `createControlledTimerDriver()` when you want deterministic interval tests that advance the runtime clock explicitly instead of waiting for real time.

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

const Editing = state<Enter, { tickCount: number }, TimeoutId>({
  Enter: (_, __, { startInterval }) => startInterval("autosave", 20),

  IntervalTriggered: (data, _, { update }) =>
    update({
      ...data,
      tickCount: data.tickCount + 1,
    }),
})

const timerDriver = createControlledTimerDriver()
const context = createInitialContext([Editing({ tickCount: 0 })])
const runtime = createRuntime(context, {}, {}, { timerDriver })

await runtime.run(enter())
await timerDriver.advanceBy(60)

const currentState = runtime.currentState()

if (isState(currentState, Editing)) {
  currentState.data.tickCount
}
```

With a `20` millisecond interval, advancing the controlled timer driver by `60` milliseconds triggers the interval three times.

## Behavior notes

- Intervals emit `IntervalStarted` once, then `IntervalTriggered` repeatedly until they are cancelled.
- `restartInterval` cancels an active interval before starting the replacement interval.
- `cancelInterval` is a no-op if that interval is not currently running.
- When a state transition leaves the current state, Fizz clears any active intervals owned by that state without emitting `IntervalCancelled`.
- Interval actions are available automatically once the state declares a `TimeoutId` generic.

## Reference

Intervals are exposed through the main package exports:

```typescript
import {
  cancelInterval,
  intervalCancelled,
  intervalStarted,
  intervalTriggered,
  restartInterval,
  startInterval,
} from "@tdreyno/fizz"
```

In most state-machine code, you will use the helper functions injected into the state handler utils rather than calling the effect creators directly.
