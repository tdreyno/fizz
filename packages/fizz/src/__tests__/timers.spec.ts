import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter, OnFrame } from "../action"
import { createAction, enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { createControlledTimerDriver, createRuntime } from "../runtime"
import { isState, state } from "../state"

type TimeoutId = "autosave" | "flashSaved"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

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

  test("should type timer helpers to the timeout id union", () => {
    state<Enter, undefined, TimeoutId>({
      Enter: (_, __, { startTimer, restartTimer, cancelTimer }) => {
        startTimer("autosave", 100)
        restartTimer("flashSaved", 200)
        cancelTimer("autosave")

        // @ts-expect-error timeout id should be narrowed to the declared union
        startTimer("unknown", 100)

        // @ts-expect-error timeout id should be narrowed to the declared union
        restartTimer("unknown", 100)

        // @ts-expect-error timeout id should be narrowed to the declared union
        cancelTimer("unknown")

        return noop()
      },
    })
  })

  test("should support interval handlers and keep triggering until cancelled", async () => {
    const Editing = state<Enter, Data, TimeoutId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("autosave", 10),
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
      "started:autosave",
      "triggered:autosave",
      "triggered:autosave",
      "triggered:autosave",
      "cancelled:autosave",
    ])
  })

  test("should restart an active interval by cancelling it before starting the replacement", async () => {
    const save = createAction("Save")
    type Save = ActionCreatorType<typeof save>

    const Editing = state<Enter | Save, Data, TimeoutId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("autosave", 100),
        ],

        Save: (data, _, { restartInterval, update }) => [
          update(appendEvent(data, "save")),
          restartInterval("autosave", 25),
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
      "started:autosave",
      "save",
      "cancelled:autosave",
      "started:autosave",
      "triggered:autosave",
      "cancelled:autosave",
    ])
  })

  test("should not dispatch IntervalCancelled when cancelling an interval that is not running", async () => {
    const cancelNow = createAction("CancelNow")
    type CancelNow = ActionCreatorType<typeof cancelNow>

    const Editing = state<Enter | CancelNow, Data, TimeoutId>(
      {
        Enter: noop,

        CancelNow: (data, _, { cancelInterval, update }) => [
          cancelInterval("autosave"),
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

    const Editing = state<Enter | Leave, Data, TimeoutId>(
      {
        Enter: (data, _, { startInterval, update }) => [
          update(appendEvent(data, "enter")),
          startInterval("autosave", 20),
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

  test("should type interval helpers to the timeout id union", () => {
    state<Enter, undefined, TimeoutId>({
      Enter: (_, __, { startInterval, restartInterval, cancelInterval }) => {
        startInterval("autosave", 100)
        restartInterval("flashSaved", 200)
        cancelInterval("autosave")

        // @ts-expect-error timeout id should be narrowed to the declared union
        startInterval("unknown", 100)

        // @ts-expect-error timeout id should be narrowed to the declared union
        restartInterval("unknown", 100)

        // @ts-expect-error timeout id should be narrowed to the declared union
        cancelInterval("unknown")

        return noop()
      },
    })
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
