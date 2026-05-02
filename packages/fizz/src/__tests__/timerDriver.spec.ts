import { afterEach, describe, expect, jest, test } from "@jest/globals"

import {
  createControlledTimerDriver,
  createDefaultTimerDriver,
} from "../runtime/timerDriver"

describe("timerDriver", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("default driver should schedule and cancel timeout and interval handles", () => {
    const setTimeoutSpy = jest.spyOn(global, "setTimeout")
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout")
    const setIntervalSpy = jest.spyOn(global, "setInterval")
    const clearIntervalSpy = jest.spyOn(global, "clearInterval")

    const driver = createDefaultTimerDriver()
    const timerHandle = driver.start(25, () => undefined)
    const intervalHandle = driver.startInterval(15, () => undefined)

    driver.cancel(timerHandle)
    driver.cancel(intervalHandle)

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  test("default driver frame handles should reschedule while active and stop after cancel", () => {
    let nextId = 1
    const callbacks = new Map<number, FrameRequestCallback>()

    const originalRequestAnimationFrame = global.requestAnimationFrame as
      | typeof requestAnimationFrame
      | undefined
    const originalCancelAnimationFrame = global.cancelAnimationFrame as
      | typeof cancelAnimationFrame
      | undefined

    Object.defineProperty(global, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: (() => 0) as typeof requestAnimationFrame,
    })
    Object.defineProperty(global, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value: (() => undefined) as typeof cancelAnimationFrame,
    })

    const requestAnimationFrameSpy = jest
      .spyOn(global, "requestAnimationFrame")
      .mockImplementation(callback => {
        const id = nextId++

        callbacks.set(id, callback)

        return id
      })

    const cancelAnimationFrameSpy = jest
      .spyOn(global, "cancelAnimationFrame")
      .mockImplementation(id => {
        callbacks.delete(id)
      })

    const onFrame = jest.fn()
    const driver = createDefaultTimerDriver()
    const frameHandle = driver.startFrame(onFrame, { loop: true })

    const firstCallback = callbacks.get(1)

    if (!firstCallback) {
      throw new Error("Expected first frame callback")
    }

    firstCallback(16)

    const secondCallback = callbacks.get(2)

    if (!secondCallback) {
      throw new Error("Expected second frame callback")
    }

    driver.cancel(frameHandle)
    secondCallback(32)

    if (originalRequestAnimationFrame) {
      Object.defineProperty(global, "requestAnimationFrame", {
        configurable: true,
        writable: true,
        value: originalRequestAnimationFrame,
      })
    }

    if (originalCancelAnimationFrame) {
      Object.defineProperty(global, "cancelAnimationFrame", {
        configurable: true,
        writable: true,
        value: originalCancelAnimationFrame,
      })
    }

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2)
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2)
    expect(onFrame).toHaveBeenCalledTimes(1)
    expect(onFrame).toHaveBeenCalledWith(16)
  })

  test("controlled driver should advance timers in due-order", async () => {
    const driver = createControlledTimerDriver()
    const events: string[] = []

    driver.start(30, () => {
      events.push("slow")
    })
    driver.start(10, () => {
      events.push("fast")
    })

    await driver.advanceBy(30)

    expect(events).toEqual(["fast", "slow"])
  })

  test("controlled driver should support interval repeats and cancellation", async () => {
    const driver = createControlledTimerDriver()
    const events: string[] = []

    const intervalHandle = driver.startInterval(5, () => {
      events.push("tick")
    })

    await driver.advanceBy(16)
    driver.cancel(intervalHandle)
    await driver.advanceBy(20)

    expect(events).toEqual(["tick", "tick", "tick"])
  })

  test("controlled driver should run frames and drain all timers", async () => {
    const driver = createControlledTimerDriver()
    const frameEvents: number[] = []
    const timerEvents: string[] = []

    const frameHandle = driver.startFrame(
      timestamp => {
        frameEvents.push(timestamp)
      },
      { loop: true },
    )

    driver.start(6, () => {
      timerEvents.push("a")
    })
    driver.start(12, () => {
      timerEvents.push("b")
    })

    await driver.advanceFrames(3, 8)
    driver.cancel(frameHandle)
    await driver.runAll()

    expect(frameEvents).toEqual([8, 16, 24])
    expect(timerEvents).toEqual(["a", "b"])
  })
})
