# Intervals

Fizz intervals let a state schedule repeating work without leaving the state machine model. You start, restart, or cancel an interval from a state handler, and the runtime feeds the interval lifecycle back into the same state as regular actions.

Intervals are a good fit for polling, periodic refresh, heartbeats, and other recurring work. See [Timers](./timers.md) for one-time delayed actions.

## How intervals work

Declare an interval id union as the fourth generic parameter to `state(...)` when you want interval ids to stay distinct from timer ids. If the state only uses intervals, use `never` for the timer-id slot. Fizz then adds three interval helper functions to the handler utils:

- `startInterval(intervalId, delay)`
- `cancelInterval(intervalId)`
- `restartInterval(intervalId, delay)`

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
import { Enter, state, whichInterval } from "@tdreyno/fizz"

type IntervalId = "healthCheck"

type Data = {
  events: string[]
  tickCount: number
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const Polling = state<Enter, Data, never, IntervalId>(
  {
    Enter: (data, _, { startInterval, update }) => [
      update(appendEvent(data, "enter")),
      startInterval("healthCheck", 1000),
    ],

    IntervalStarted: (data, { timeoutId }, { update }) => {
      return update(appendEvent(data, `started:${timeoutId}`))
    },

    IntervalTriggered: whichInterval<IntervalId>({
      healthCheck: (data, payload, { cancelInterval, update }) => {
        const intervalId: "healthCheck" = payload.timeoutId
        const nextData = {
          ...appendEvent(data, `triggered:${intervalId}`),
          tickCount: data.tickCount + 1,
        }

        const nextState = update(nextData)

        return nextData.tickCount >= 3
          ? [nextState, cancelInterval(intervalId)]
          : nextState
      },
    }),

    IntervalCancelled: (data, { timeoutId }, { update }) => {
      return update(appendEvent(data, `cancelled:${timeoutId}`))
    },
  },
  { name: "Polling" },
)
```

This is the core interval pattern: `Enter` starts the schedule, `IntervalTriggered` handles each repetition, and cancellation is explicit. `whichInterval(...)` is exhaustive over the declared interval id union, so every interval id must be handled.

## Matching with `whichInterval`

Use `whichInterval(...)` when an interval handler should branch by interval id and you want the branch payload narrowed to the exact interval id instead of manually checking `timeoutId`.

```typescript
import { Enter, state, whichInterval } from "@tdreyno/fizz"

type IntervalId = "presence" | "sync"

type Data = {
  lastPresenceTick: number
  lastSyncTick: number
}

const Connected = state<Enter, Data, never, IntervalId>({
  Enter: (_, __, { startInterval }) => [
    startInterval("presence", 5000),
    startInterval("sync", 30000),
  ],

  IntervalTriggered: whichInterval<IntervalId>({
    presence: (data, payload, { update }) => {
      const intervalId: "presence" = payload.timeoutId

      return update({
        ...data,
        lastPresenceTick:
          intervalId === "presence" ? Date.now() : data.lastPresenceTick,
      })
    },

    sync: (data, payload, { update }) => {
      const intervalId: "sync" = payload.timeoutId

      return update({
        ...data,
        lastSyncTick: intervalId === "sync" ? Date.now() : data.lastSyncTick,
      })
    },
  }),
})
```

`whichInterval(...)` guarantees three things:

- The handler map is exhaustive for the declared `IntervalId` union.
- Each branch narrows `payload.timeoutId` to its specific interval id.
- The returned function plugs directly into interval handlers such as `IntervalTriggered`.

Use `whichInterval<IntervalId>({...})` directly, even when the surrounding state also declares a separate timer-id union.

## Restarting intervals with `restartInterval`

`restartInterval` is useful when you want to replace an active interval with a new cadence. If the interval is already running, Fizz cancels it first and starts a fresh one with the new delay.

```typescript
import { ActionCreatorType, Enter, createAction, state } from "@tdreyno/fizz"

const faster = createAction("Faster")
type Faster = ActionCreatorType<typeof faster>

type IntervalId = "refresh"

type Data = {
  intervalMs: number
  refreshCount: number
}

const Refreshing = state<Enter | Faster, Data, never, IntervalId>(
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
import { Enter, state, whichInterval } from "@tdreyno/fizz"

type IntervalId = "presence" | "sync"

type Data = {
  lastPresenceTick: number
  lastSyncTick: number
}

const Connected = state<Enter, Data, never, IntervalId>(
  {
    Enter: (_, __, { startInterval }) => [
      startInterval("presence", 5000),
      startInterval("sync", 30000),
    ],

    IntervalTriggered: whichInterval<IntervalId>({
      presence: (data, payload, { update }) => {
        const intervalId: "presence" = payload.timeoutId

        return update({
          ...data,
          lastPresenceTick:
            intervalId === "presence" ? Date.now() : data.lastPresenceTick,
        })
      },

      sync: (data, payload, { update }) => {
        const intervalId: "sync" = payload.timeoutId

        return update({
          ...data,
          lastSyncTick: intervalId === "sync" ? Date.now() : data.lastSyncTick,
        })
      },
    }),
  },
  { name: "Connected" },
)
```

The `timeoutId` value is narrowed to the declared interval-id member in each branch, so TypeScript will reject unknown ids and missing handlers.

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

type IntervalId = "autosave"

const Editing = state<Enter, { tickCount: number }, never, IntervalId>({
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

## Interval Helper Reference

Intervals are exposed through the main package exports:

```typescript
import {
  cancelInterval,
  intervalCancelled,
  intervalStarted,
  intervalTriggered,
  restartInterval,
  startInterval,
  whichInterval,
} from "@tdreyno/fizz"
```

In most state-machine code, you will use the helper functions injected into the state handler utils or `whichInterval(...)` rather than calling the effect creators directly.

## requestAnimationFrame loops

Intervals are based on elapsed time. Frame loops are based on the browser render cycle. Use `requestAnimationFrame` when the work should stay synchronized with painting, such as sprite movement, canvas drawing, or visual progress indicators.

Fizz exposes frame loops through two zero-argument helpers:

- `startFrame()`
- `cancelFrame()`

Unlike intervals, frame loops do not use timeout ids. A state either has an active frame loop or it does not. Each animation frame dispatches the existing `OnFrame` action with the browser timestamp.

```typescript
import { Enter, OnFrame, state } from "@tdreyno/fizz"

type Data = {
  angle: number
  running: boolean
}

const Spinning = state<Enter | OnFrame, Data>({
  Enter: (data, _, { startFrame, update }) => [
    update({ ...data, running: true }),
    startFrame(),
  ],

  OnFrame: (data, timestamp, { cancelFrame, update }) => {
    const nextAngle = (data.angle + 6) % 360
    const nextData = {
      ...data,
      angle: nextAngle,
    }

    return nextAngle === 0
      ? [update({ ...nextData, running: false }), cancelFrame()]
      : update(nextData)
  },
})
```

This pattern is intentionally different from the older recursive `onFrame()` example style. Start the loop once, handle each `OnFrame` action, and stop it explicitly when the animation is done.

## Testing frame loops

`createControlledTimerDriver()` also supports frame-loop tests. Use `advanceFrames(count, frameMs)` to simulate browser frames deterministically.

```typescript
import {
  Enter,
  OnFrame,
  createControlledTimerDriver,
  createInitialContext,
  createRuntime,
  enter,
  isState,
  state,
} from "@tdreyno/fizz"

const Animating = state<Enter | OnFrame, { frameCount: number }>({
  Enter: (_, __, { startFrame }) => startFrame(),

  OnFrame: (data, _, { cancelFrame, update }) => {
    const nextData = {
      frameCount: data.frameCount + 1,
    }

    return nextData.frameCount >= 3
      ? [update(nextData), cancelFrame()]
      : update(nextData)
  },
})

const timerDriver = createControlledTimerDriver()
const context = createInitialContext([Animating({ frameCount: 0 })])
const runtime = createRuntime(context, {}, {}, { timerDriver })

await runtime.run(enter())
await timerDriver.advanceFrames(3, 16)

const currentState = runtime.currentState()

if (isState(currentState, Animating)) {
  currentState.data.frameCount
}
```

This makes frame-driven behavior deterministic without relying on the browser or wall-clock time.

## Behavior notes

- Intervals emit `IntervalStarted` once, then `IntervalTriggered` repeatedly until they are cancelled.
- `restartInterval` cancels an active interval before starting the replacement interval.
- `cancelInterval` is a no-op if that interval is not currently running.
- When a state transition leaves the current state, Fizz clears any active intervals owned by that state without emitting `IntervalCancelled`.
- Interval actions are available automatically once the state declares an `IntervalId` generic in the fourth `state(...)` slot.
- Frame loops dispatch `OnFrame` until `cancelFrame()` is called or the state exits.
- Frame loops do not use ids or emit separate started or cancelled actions.

## Reference

Intervals are exposed through the main package exports:

```typescript
import {
  OnFrame,
  cancelInterval,
  cancelFrame,
  intervalCancelled,
  intervalStarted,
  intervalTriggered,
  onFrame,
  restartInterval,
  startFrame,
  startInterval,
} from "@tdreyno/fizz"
```

In most state-machine code, you will use the helper functions injected into the state handler utils rather than calling the effect creators directly.
