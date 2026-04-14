import { describe, expect, test } from "@jest/globals"

import type {
  Action,
  ActionCreatorType,
  Enter,
  OnFrame,
  TimerCancelled,
  TimerCompleted,
  TimerPayload,
  TimerStarted,
} from "../action"
import { createAction, enter } from "../action"
import { createInitialContext } from "../context"
import type { Effect } from "../effect"
import { noop } from "../effect"
import { createControlledTimerDriver, createRuntime } from "../runtime"
import type { HandlerReturn, StateTransition } from "../state"
import {
  debounce,
  isState,
  state,
  throttle,
  whichInterval,
  whichTimeout,
} from "../state"

type TimeoutId = "autosave" | "flashSaved"
type IntervalId = "heartbeat" | "sync"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

type SaveTimerActions =
  | Action<"Save", string>
  | Enter
  | TimerStarted<TimeoutId>
  | TimerCompleted<TimeoutId>
  | TimerCancelled<TimeoutId>

type SaveTimerState = StateTransition<string, SaveTimerActions, Data>
type BranchTimerState = StateTransition<string, Action<string, unknown>, Data>
type BranchIntervalState = StateTransition<
  string,
  Action<string, unknown>,
  {
    events: string[]
    syncCount: number
  }
>

const expectTimeoutId = (timeoutId: TimeoutId): TimeoutId => timeoutId
const expectIntervalId = (intervalId: IntervalId): IntervalId => intervalId

describe("timers", () => {
  test("should support timer handlers and helper typing without explicitly listing timer actions", async () => {
    const save = createAction("Save")
    type Save = ActionCreatorType<typeof save>

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter | Save, Data, TimeoutId>(
      {
        Enter: (data, _, { startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startTimer("flashSaved", 10),
        ],

        Save: (data, _, { restartTimer, update }) => [
          update(appendEvent(data, "save")),
          restartTimer("autosave", 50),
        ],

        TimerStarted: (data, { timeoutId }, { update }) => {
          const narrowed: TimeoutId = timeoutId

          return update(appendEvent(data, `started:${narrowed}`))
        },

        TimerCompleted: (data, { timeoutId }, { update }) => {
          if (timeoutId === "autosave") {
            return Done(appendEvent(data, "completed:autosave"))
          }

          return update(appendEvent(data, `completed:${timeoutId}`))
        },

        TimerCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { save }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(save())
    await timerDriver.advanceBy(50)

    const currentState = runtime.currentState()

    expect(isState(currentState, Done)).toBeTruthy()

    if (!isState(currentState, Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "started:flashSaved",
      "save",
      "started:autosave",
      "completed:flashSaved",
      "completed:autosave",
    ])
  })

  test("should restart an active timer by cancelling it before starting the replacement", async () => {
    const save = createAction("Save")
    type Save = ActionCreatorType<typeof save>

    const Editing = state<Enter | Save, Data, TimeoutId>(
      {
        Enter: (data, _, { startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startTimer("autosave", 100),
        ],

        Save: (data, _, { restartTimer, update }) => [
          update(appendEvent(data, "save")),
          restartTimer("autosave", 50),
        ],

        TimerStarted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `started:${timeoutId}`))
        },

        TimerCompleted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `completed:${timeoutId}`))
        },

        TimerCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { save }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(save())
    await timerDriver.advanceBy(100)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "started:autosave",
      "save",
      "cancelled:autosave",
      "started:autosave",
      "completed:autosave",
    ])
  })

  test("should not dispatch TimerCancelled when cancelling a timer that is not running", async () => {
    const cancelNow = createAction("CancelNow")
    type CancelNow = ActionCreatorType<typeof cancelNow>

    const Editing = state<Enter | CancelNow, Data, TimeoutId>(
      {
        Enter: noop,

        CancelNow: (data, _, { cancelTimer, update }) => [
          cancelTimer("autosave"),
          update(appendEvent(data, "cancel-attempt")),
        ],

        TimerCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const runtime = createRuntime(
      context,
      { cancelNow },
      {},
      {
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(enter())
    await runtime.run(cancelNow())

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual(["cancel-attempt"])
  })

  test("should cancel running timers when leaving the state", async () => {
    const leave = createAction("Leave")
    type Leave = ActionCreatorType<typeof leave>

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter | Leave, Data, TimeoutId>(
      {
        Enter: (data, _, { startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startTimer("autosave", 100),
        ],

        Leave: data => Done(appendEvent(data, "leave")),

        TimerCompleted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `completed:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { leave }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(leave())
    await timerDriver.advanceBy(100)

    const currentState = runtime.currentState()

    expect(isState(currentState, Done)).toBeTruthy()

    if (!isState(currentState, Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual(["enter", "leave"])
  })

  test("should type timer helpers to the timeout id union independently from interval ids", () => {
    state<Enter, undefined, TimeoutId, IntervalId>({
      Enter: (
        _,
        __,
        { startTimer, restartTimer, cancelTimer, startInterval },
      ) => {
        startTimer("autosave", 100)
        restartTimer("flashSaved", 200)
        cancelTimer("autosave")
        startInterval("heartbeat", 100)

        // @ts-expect-error timer helper should reject interval ids
        startTimer("heartbeat", 100)

        // @ts-expect-error timer helper should reject interval ids
        restartTimer("sync", 100)

        // @ts-expect-error timer helper should reject interval ids
        cancelTimer("heartbeat")

        // @ts-expect-error timer helper should reject unknown timeout ids
        startTimer("unknown", 100)

        return noop()
      },
    })
  })

  test("should type timer and interval payloads against separate unions", () => {
    state<Enter, Data, TimeoutId, IntervalId>({
      Enter: noop,

      TimerCompleted: (data, { timeoutId }, { update }) => {
        expectTimeoutId(timeoutId)

        // @ts-expect-error timer payload should not narrow to interval ids
        expectIntervalId(timeoutId)

        return update(appendEvent(data, timeoutId))
      },

      IntervalTriggered: (data, { timeoutId }, { update }) => {
        expectIntervalId(timeoutId)

        // @ts-expect-error interval payload should not narrow to timeout ids
        expectTimeoutId(timeoutId)

        return update(appendEvent(data, timeoutId))
      },
    })
  })

  test("should dispatch timer handlers with whichTimeout", async () => {
    const Editing = state<Enter, Data, TimeoutId, IntervalId>(
      {
        Enter: (data, _, { startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startTimer("flashSaved", 10),
          startTimer("autosave", 20),
        ],

        TimerCompleted: whichTimeout<TimeoutId>({
          autosave: (data: Data, payload, { update }) => {
            const timeoutId: "autosave" = payload.timeoutId

            return update(appendEvent(data, `completed:${timeoutId}`))
          },

          flashSaved: (data: Data, payload, { update }) => {
            const timeoutId: "flashSaved" = payload.timeoutId

            return update(appendEvent(data, `completed:${timeoutId}`))
          },
        }),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceBy(20)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "completed:flashSaved",
      "completed:autosave",
    ])
  })

  test("should type whichTimeout exhaustively to the timeout id union", () => {
    state<Enter, Data, TimeoutId, IntervalId>({
      Enter: noop,

      TimerCompleted: whichTimeout<TimeoutId>({
        autosave: (data: Data, payload, { update }) => {
          const timeoutId: "autosave" = payload.timeoutId

          return update(appendEvent(data, timeoutId))
        },

        flashSaved: (data: Data, payload, { update }) => {
          const timeoutId: "flashSaved" = payload.timeoutId

          return update(appendEvent(data, timeoutId))
        },
      }),
    })

    // @ts-expect-error missing timeout id should fail exhaustiveness
    whichTimeout<TimeoutId>({
      autosave: () => noop(),
    })

    whichTimeout<TimeoutId>({
      autosave: () => noop(),
      flashSaved: () => noop(),
      // @ts-expect-error unknown timeout id should be rejected
      unknown: () => noop(),
    })
  })

  test("should support interval handlers and keep triggering until cancelled", async () => {
    const Editing = state<Enter, Data, TimeoutId, IntervalId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("heartbeat", 10),
        ],

        IntervalStarted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `started:${timeoutId}`))
        },

        IntervalTriggered: (
          data,
          { timeoutId },
          { cancelInterval, update },
        ) => {
          const nextData = update(appendEvent(data, `triggered:${timeoutId}`))

          return data.events.length >= 4
            ? [nextData, cancelInterval(timeoutId)]
            : nextData
        },

        IntervalCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceBy(35)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "started:heartbeat",
      "triggered:heartbeat",
      "triggered:heartbeat",
      "triggered:heartbeat",
      "cancelled:heartbeat",
    ])
  })

  test("should restart an active interval by cancelling it before starting the replacement", async () => {
    const save = createAction("Save")
    type Save = ActionCreatorType<typeof save>

    const Editing = state<Enter | Save, Data, TimeoutId, IntervalId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("heartbeat", 100),
        ],

        Save: (data, _, { restartInterval, update }) => [
          update(appendEvent(data, "save")),
          restartInterval("heartbeat", 25),
        ],

        IntervalStarted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `started:${timeoutId}`))
        },

        IntervalTriggered: (
          data,
          { timeoutId },
          { cancelInterval, update },
        ) => [
          update(appendEvent(data, `triggered:${timeoutId}`)),
          cancelInterval(timeoutId),
        ],

        IntervalCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { save }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(save())
    await timerDriver.advanceBy(100)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "started:heartbeat",
      "save",
      "cancelled:heartbeat",
      "started:heartbeat",
      "triggered:heartbeat",
      "cancelled:heartbeat",
    ])
  })

  test("should not dispatch IntervalCancelled when cancelling an interval that is not running", async () => {
    const cancelNow = createAction("CancelNow")
    type CancelNow = ActionCreatorType<typeof cancelNow>

    const Editing = state<Enter | CancelNow, Data, TimeoutId, IntervalId>(
      {
        Enter: noop,

        CancelNow: (data, _, { cancelInterval, update }) => [
          cancelInterval("heartbeat"),
          update(appendEvent(data, "cancel-attempt")),
        ],

        IntervalCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const runtime = createRuntime(
      context,
      { cancelNow },
      {},
      {
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(enter())
    await runtime.run(cancelNow())

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual(["cancel-attempt"])
  })

  test("should cancel running intervals when leaving the state", async () => {
    const leave = createAction("Leave")
    type Leave = ActionCreatorType<typeof leave>

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter | Leave, Data, TimeoutId, IntervalId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("heartbeat", 20),
        ],

        Leave: data => Done(appendEvent(data, "leave")),

        IntervalTriggered: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `triggered:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { leave }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(leave())
    await timerDriver.advanceBy(100)

    const currentState = runtime.currentState()

    expect(isState(currentState, Done)).toBeTruthy()

    if (!isState(currentState, Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual(["enter", "leave"])
  })

  test("should type interval helpers to the interval id union independently from timeout ids", () => {
    state<Enter, undefined, TimeoutId, IntervalId>({
      Enter: (
        _,
        __,
        { startTimer, startInterval, restartInterval, cancelInterval },
      ) => {
        startTimer("autosave", 100)
        startInterval("heartbeat", 100)
        restartInterval("sync", 200)
        cancelInterval("heartbeat")

        // @ts-expect-error interval helper should reject timeout ids
        startInterval("autosave", 100)

        // @ts-expect-error interval helper should reject timeout ids
        restartInterval("flashSaved", 100)

        // @ts-expect-error interval helper should reject timeout ids
        cancelInterval("autosave")

        // @ts-expect-error interval helper should reject unknown interval ids
        startInterval("unknown", 100)

        return noop()
      },
    })
  })

  test("should dispatch interval handlers with whichInterval", async () => {
    const Editing = state<Enter, Data, TimeoutId, IntervalId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("sync", 10),
          startInterval("heartbeat", 15),
        ],

        IntervalTriggered: whichInterval<IntervalId>({
          heartbeat: (data: Data, payload, { cancelInterval, update }) => {
            const intervalId: "heartbeat" = payload.timeoutId

            return [
              update(appendEvent(data, `triggered:${intervalId}`)),
              cancelInterval(intervalId),
            ]
          },

          sync: (data: Data, payload, { cancelInterval, update }) => {
            const intervalId: "sync" = payload.timeoutId

            return [
              update(appendEvent(data, `triggered:${intervalId}`)),
              cancelInterval(intervalId),
            ]
          },
        }),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceBy(15)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "triggered:sync",
      "triggered:heartbeat",
    ])
  })

  test("should type whichInterval exhaustively to the interval id union", () => {
    state<Enter, Data, TimeoutId, IntervalId>({
      Enter: noop,

      IntervalTriggered: whichInterval<IntervalId>({
        heartbeat: (data: Data, payload, { update }) => {
          const intervalId: "heartbeat" = payload.timeoutId

          return update(appendEvent(data, intervalId))
        },

        sync: (data: Data, payload, { update }) => {
          const intervalId: "sync" = payload.timeoutId

          return update(appendEvent(data, intervalId))
        },
      }),
    })

    // @ts-expect-error missing interval id should fail exhaustiveness
    whichInterval<IntervalId>({
      heartbeat: () => noop(),
    })

    whichInterval<IntervalId>({
      heartbeat: () => noop(),
      sync: () => noop(),
      // @ts-expect-error unknown interval id should be rejected
      autosave: () => noop(),
    })
  })

  test("should debounce a direct handler without leaking internal timer events", async () => {
    const save = createAction<"Save", string>("Save")
    type Save = ActionCreatorType<typeof save>

    const Editing = state<Enter | Save, Data, TimeoutId>(
      {
        Enter: noop,

        Save: debounce(
          (
            data: Data,
            payload: string,
            {
              update,
            }: {
              update: (data: Data) => SaveTimerState
            },
          ): SaveTimerState => {
            return update(appendEvent(data, `save:${payload}`))
          },
          20,
        ),

        TimerStarted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `timer-started:${timeoutId}`))
        },

        TimerCompleted: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `timer-completed:${timeoutId}`))
        },

        TimerCancelled: (data, { timeoutId }, { update }) => {
          return update(appendEvent(data, `timer-cancelled:${timeoutId}`))
        },
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { save }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(save("a"))
    await runtime.run(save("ab"))
    await runtime.run(save("abc"))
    await timerDriver.advanceBy(20)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual(["save:abc"])
  })

  test("should debounce whichTimeout branches independently from immediate branches", async () => {
    const Editing = state<Enter, Data, TimeoutId>(
      {
        Enter: (data, _, { startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startTimer("autosave", 10),
          startTimer("flashSaved", 20),
        ],

        TimerCompleted: whichTimeout<TimeoutId>({
          autosave: debounce(
            (
              data: Data,
              payload: TimerPayload<"autosave">,
              {
                update,
              }: {
                update: (data: Data) => BranchTimerState
              },
            ): BranchTimerState => {
              const timeoutId: "autosave" = payload.timeoutId

              return update(appendEvent(data, `debounced:${timeoutId}`))
            },
            20,
          ),

          flashSaved: (
            data: Data,
            payload: TimerPayload<"flashSaved">,
            {
              update,
            }: {
              update: (data: Data) => BranchTimerState
            },
          ): BranchTimerState => {
            const timeoutId: "flashSaved" = payload.timeoutId

            return update(appendEvent(data, `completed:${timeoutId}`))
          },
        }),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceBy(40)

    const currentState = runtime.currentState()

    if (!isState(currentState, Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual([
      "enter",
      "completed:flashSaved",
      "debounced:autosave",
    ])
  })

  test("should throttle whichInterval branches independently", async () => {
    type BranchData = {
      events: string[]
      syncCount: number
    }

    const Polling = state<Enter, BranchData, never, IntervalId>(
      {
        Enter: (_, __, { startInterval }) => [
          startInterval("heartbeat", 5),
          startInterval("sync", 5),
        ],

        IntervalTriggered: whichInterval<IntervalId>({
          heartbeat: throttle(
            (
              data: BranchData,
              payload: TimerPayload<"heartbeat">,
              {
                update,
              }: {
                update: (data: BranchData) => BranchIntervalState
              },
            ): BranchIntervalState => {
              const intervalId: "heartbeat" = payload.timeoutId

              return update({
                ...data,
                events: [...data.events, `heartbeat:${intervalId}`],
              })
            },
            20,
          ),

          sync: throttle(
            (
              data: BranchData,
              payload: TimerPayload<"sync">,
              {
                cancelInterval,
                update,
              }: {
                cancelInterval: (intervalId: "sync") => Effect
                update: (data: BranchData) => BranchIntervalState
              },
            ): HandlerReturn => {
              const intervalId: "sync" = payload.timeoutId
              const syncCount = data.syncCount + 1
              const nextData = {
                ...data,
                syncCount,
                events: [...data.events, `sync:${intervalId}:${syncCount}`],
              }

              return syncCount >= 2
                ? [update(nextData), cancelInterval(intervalId)]
                : update(nextData)
            },
            20,
          ),
        }),
      },
      { name: "Polling" },
    )

    const context = createInitialContext([
      Polling({
        events: [],
        syncCount: 0,
      }),
    ])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceBy(45)

    const currentState = runtime.currentState()

    if (!isState(currentState, Polling)) {
      throw new Error("Expected Polling state")
    }

    expect(currentState.data.events).toEqual([
      "heartbeat:heartbeat",
      "sync:sync:1",
      "heartbeat:heartbeat",
      "sync:sync:2",
      "heartbeat:heartbeat",
    ])
  })

  test("should dispatch OnFrame repeatedly until cancelled", async () => {
    type FrameData = {
      frameCount: number
      lastTimestamp: number
    }

    const Animating = state<Enter | OnFrame, FrameData>({
      Enter: (_, __, { startFrame }) => startFrame(),

      OnFrame: (data, timestamp, { cancelFrame, update }) => {
        const nextData = {
          frameCount: data.frameCount + 1,
          lastTimestamp: timestamp,
        }

        return nextData.frameCount >= 3
          ? [update(nextData), cancelFrame()]
          : update(nextData)
      },
    })

    const context = createInitialContext([
      Animating({ frameCount: 0, lastTimestamp: 0 }),
    ])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, {}, {}, { timerDriver })

    await runtime.run(enter())
    await timerDriver.advanceFrames(5, 10)

    const currentState = runtime.currentState()

    if (!isState(currentState, Animating)) {
      throw new Error("Expected Animating state")
    }

    expect(currentState.data).toEqual({
      frameCount: 3,
      lastTimestamp: 30,
    })
  })

  test("should not fail when cancelling a frame loop that is not running", async () => {
    const stop = createAction("Stop")
    type Stop = ActionCreatorType<typeof stop>

    type FrameData = {
      events: string[]
    }

    const Idle = state<Enter | Stop, FrameData>({
      Enter: noop,

      Stop: (data, _, { cancelFrame, update }) => [
        cancelFrame(),
        update(appendEvent(data, "cancel-attempt")),
      ],
    })

    const context = createInitialContext([Idle({ events: [] })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { stop }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(stop())
    await timerDriver.advanceFrames(1)

    const currentState = runtime.currentState()

    if (!isState(currentState, Idle)) {
      throw new Error("Expected Idle state")
    }

    expect(currentState.data.events).toEqual(["cancel-attempt"])
  })

  test("should cancel the frame loop when leaving the state", async () => {
    type FrameData = {
      frameCount: number
    }

    const leave = createAction("Leave")
    type Leave = ActionCreatorType<typeof leave>

    const Done = state<Enter, FrameData>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Animating = state<Enter | Leave | OnFrame, FrameData>(
      {
        Enter: (_, __, { startFrame }) => startFrame(),

        Leave: data => Done(data),

        OnFrame: (data, _, { update }) =>
          update({
            frameCount: data.frameCount + 1,
          }),
      },
      { name: "Animating" },
    )

    const context = createInitialContext([Animating({ frameCount: 0 })])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(context, { leave }, {}, { timerDriver })

    await runtime.run(enter())
    await runtime.run(leave())
    await timerDriver.advanceFrames(3)

    const currentState = runtime.currentState()

    if (!isState(currentState, Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.frameCount).toBe(0)
  })

  test("should type frame helpers without accepting ids", () => {
    state<Enter, undefined>({
      Enter: (_, __, { startFrame, cancelFrame }) => {
        startFrame()
        cancelFrame()

        // @ts-expect-error frame helpers do not accept ids
        startFrame("spinner")

        // @ts-expect-error frame helpers do not accept ids
        cancelFrame("spinner")

        return noop()
      },
    })
  })
})
