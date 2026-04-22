import { describe, expect, jest, test } from "@jest/globals"

import type { RuntimeTimerDriver } from "../runtime/timerDriver"
import type { ActiveFrame, ActiveTimer } from "../runtime/timerScheduler"
import {
  cancelActiveFrameOperation,
  cancelActiveIntervalOperation,
  cancelActiveTimerOperation,
  canHandleFrameElapsed,
  canHandleIntervalElapsed,
  canHandleTimerElapsed,
  clearScheduledOperations,
  replaceIntervalOperation,
  replaceTimerOperation,
  startFrameOperation,
  startIntervalOperation,
  startTimerOperation,
} from "../runtime/timerScheduler"

const createMockTimerDriver = () => {
  const start = jest.fn<RuntimeTimerDriver["start"]>(() => "timer-handle")
  const startInterval = jest.fn<RuntimeTimerDriver["startInterval"]>(
    () => "interval-handle",
  )
  const startFrame = jest.fn<RuntimeTimerDriver["startFrame"]>(
    () => "frame-handle",
  )
  const cancel = jest.fn<RuntimeTimerDriver["cancel"]>(() => undefined)

  return {
    cancel,
    start,
    startFrame,
    startInterval,
  }
}

describe("timerScheduler", () => {
  test("should start and cancel timer operations with token validation", async () => {
    const timerDriver = createMockTimerDriver()
    const timers = new Map<string, ActiveTimer>()
    const onElapsed = jest.fn(async (token: number) => {
      void token
    })

    startTimerOperation({
      delay: 20,
      nextToken: () => 7,
      onElapsed,
      timeoutId: "save",
      timerDriver,
      timers,
    })

    const activeTimer = timers.get("save")

    if (!activeTimer) {
      throw new Error("Expected active timer")
    }

    expect(canHandleTimerElapsed(activeTimer, 7)).toBeTruthy()
    expect(canHandleTimerElapsed(activeTimer, 8)).toBeFalsy()

    const scheduledCallback = timerDriver.start.mock.calls[0]?.[1]

    if (!scheduledCallback) {
      throw new Error("Expected scheduled timer callback")
    }

    await scheduledCallback()

    expect(onElapsed).toHaveBeenCalledWith(7)

    const cancelled = cancelActiveTimerOperation({
      timeoutId: "save",
      timerDriver,
      timers,
    })

    expect(cancelled).toEqual({
      delay: 20,
      timeoutId: "save",
    })
    expect(timerDriver.cancel).toHaveBeenCalledWith("timer-handle")

    expect(
      cancelActiveTimerOperation({
        timeoutId: "missing",
        timerDriver,
        timers,
      }),
    ).toBeUndefined()
  })

  test("should replace active timer and interval operations", () => {
    const timerDriver = createMockTimerDriver()
    const timers = new Map<string, ActiveTimer>()
    const intervals = new Map<string, ActiveTimer>()

    startTimerOperation({
      delay: 10,
      nextToken: () => 3,
      onElapsed: async token => {
        void token
      },
      timeoutId: "save",
      timerDriver,
      timers,
    })
    startIntervalOperation({
      delay: 15,
      intervalId: "sync",
      intervals,
      nextToken: () => 9,
      onElapsed: async token => {
        void token
      },
      timerDriver,
    })

    replaceTimerOperation({
      timeoutId: "save",
      timerDriver,
      timers,
    })
    replaceIntervalOperation({
      intervalId: "sync",
      intervals,
      timerDriver,
    })

    expect(timers.size).toBe(0)
    expect(intervals.size).toBe(0)
    expect(timerDriver.cancel).toHaveBeenCalledWith("timer-handle")
    expect(timerDriver.cancel).toHaveBeenCalledWith("interval-handle")

    replaceTimerOperation({
      timeoutId: "missing",
      timerDriver,
      timers,
    })
    replaceIntervalOperation({
      intervalId: "missing",
      intervals,
      timerDriver,
    })

    expect(timerDriver.cancel).toHaveBeenCalledTimes(2)
  })

  test("should start and cancel interval operations with token validation", async () => {
    const timerDriver = createMockTimerDriver()
    const intervals = new Map<string, ActiveTimer>()
    const onElapsed = jest.fn(async (token: number) => {
      void token
    })

    startIntervalOperation({
      delay: 30,
      intervalId: "heartbeat",
      intervals,
      nextToken: () => 11,
      onElapsed,
      timerDriver,
    })

    const activeInterval = intervals.get("heartbeat")

    if (!activeInterval) {
      throw new Error("Expected active interval")
    }

    expect(canHandleIntervalElapsed(activeInterval, 11)).toBeTruthy()
    expect(canHandleIntervalElapsed(activeInterval, 12)).toBeFalsy()

    const scheduledCallback = timerDriver.startInterval.mock.calls[0]?.[1]

    if (!scheduledCallback) {
      throw new Error("Expected scheduled interval callback")
    }

    await scheduledCallback()

    expect(onElapsed).toHaveBeenCalledWith(11)

    const cancelled = cancelActiveIntervalOperation({
      intervalId: "heartbeat",
      intervals,
      timerDriver,
    })

    expect(cancelled).toEqual({
      delay: 30,
      intervalId: "heartbeat",
    })
    expect(timerDriver.cancel).toHaveBeenCalledWith("interval-handle")

    expect(
      cancelActiveIntervalOperation({
        intervalId: "missing",
        intervals,
        timerDriver,
      }),
    ).toBeUndefined()
  })

  test("should start and cancel frame operations", async () => {
    const timerDriver = createMockTimerDriver()
    const onFrame = jest.fn(async (timestamp: number, token: number) => {
      void timestamp
      void token
    })

    const frame = startFrameOperation({
      nextToken: () => 5,
      onFrame,
      timerDriver,
    })

    expect(canHandleFrameElapsed(frame, 5)).toBeTruthy()
    expect(canHandleFrameElapsed(frame, 6)).toBeFalsy()

    const frameCallback = timerDriver.startFrame.mock.calls[0]?.[0]

    if (!frameCallback) {
      throw new Error("Expected scheduled frame callback")
    }

    await frameCallback(42)

    expect(onFrame).toHaveBeenCalledWith(42, 5)

    cancelActiveFrameOperation({
      frame,
      timerDriver,
    })
    cancelActiveFrameOperation({
      frame: undefined,
      timerDriver,
    })

    expect(timerDriver.cancel).toHaveBeenCalledWith("frame-handle")
    expect(timerDriver.cancel).toHaveBeenCalledTimes(1)
  })

  test("should clear all scheduled operations", () => {
    const timerDriver = createMockTimerDriver()
    const timers = new Map<string, ActiveTimer>([
      [
        "t1",
        {
          delay: 10,
          handle: "timer-1",
          machine: { status: "scheduled", timeoutId: "t1", token: 1 },
          token: 1,
        },
      ],
      [
        "t2",
        {
          delay: 20,
          handle: "timer-2",
          machine: { status: "scheduled", timeoutId: "t2", token: 2 },
          token: 2,
        },
      ],
    ])
    const intervals = new Map<string, ActiveTimer>([
      [
        "i1",
        {
          delay: 12,
          handle: "interval-1",
          machine: { intervalId: "i1", status: "scheduled", token: 3 },
          token: 3,
        },
      ],
    ])
    const frame: ActiveFrame = {
      handle: "frame-1",
      machine: { status: "active", token: 4 },
      token: 4,
    }

    clearScheduledOperations({
      frame,
      intervals,
      timerDriver,
      timers,
    })

    expect(timers.size).toBe(0)
    expect(intervals.size).toBe(0)
    expect(timerDriver.cancel).toHaveBeenCalledWith("timer-1")
    expect(timerDriver.cancel).toHaveBeenCalledWith("timer-2")
    expect(timerDriver.cancel).toHaveBeenCalledWith("interval-1")
    expect(timerDriver.cancel).toHaveBeenCalledWith("frame-1")
  })
})
