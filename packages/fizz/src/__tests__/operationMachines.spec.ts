import { describe, expect, test } from "@jest/globals"

import {
  canHandleAsyncTokenEvent,
  createAsyncMachine,
  transitionAsync,
} from "../runtime/asyncMachine"
import {
  activateFrame,
  cancelFrame,
  cancelInterval,
  cancelTimer,
  canHandleScheduledTokenEvent,
  createFrameMachine,
  createIntervalMachine,
  createTimerMachine,
  scheduleInterval,
  scheduleTimer,
  triggerFrame,
  triggerInterval,
} from "../runtime/timerMachine"

describe("operation machines", () => {
  test("tracks async lifecycle transitions with token guards", () => {
    const idle = createAsyncMachine("profile")
    const active = transitionAsync(idle, {
      token: 1,
      type: "start",
    })
    const staleResolve = transitionAsync(active, {
      token: 2,
      type: "resolve",
    })
    const resolved = transitionAsync(active, {
      token: 1,
      type: "resolve",
    })

    expect(active.status).toBe("active")
    expect(canHandleAsyncTokenEvent(active, 1)).toBe(true)
    expect(canHandleAsyncTokenEvent(active, 2)).toBe(false)
    expect(staleResolve).toEqual(active)
    expect(resolved.status).toBe("resolved")
  })

  test("tracks timer and interval token-gated transitions", () => {
    const scheduledTimer = scheduleTimer(createTimerMachine("autosave"), 5)
    const staleCancelledTimer = cancelTimer(scheduledTimer, 4)
    const cancelledTimer = cancelTimer(scheduledTimer, 5)

    const scheduledInterval = scheduleInterval(createIntervalMachine("poll"), 6)
    const staleTriggeredInterval = triggerInterval(scheduledInterval, 7)
    const triggeredInterval = triggerInterval(scheduledInterval, 6)
    const cancelledInterval = cancelInterval(scheduledInterval, 6)

    expect(canHandleScheduledTokenEvent(scheduledTimer, 5)).toBe(true)
    expect(canHandleScheduledTokenEvent(scheduledTimer, 4)).toBe(false)
    expect(staleCancelledTimer).toEqual(scheduledTimer)
    expect(cancelledTimer.status).toBe("cancelled")

    expect(staleTriggeredInterval).toEqual(scheduledInterval)
    expect(triggeredInterval).toEqual(scheduledInterval)
    expect(cancelledInterval.status).toBe("cancelled")
  })

  test("tracks frame activation and cancellation", () => {
    const activeFrame = activateFrame(createFrameMachine(), 8)
    const staleTriggered = triggerFrame(activeFrame, 9)
    const triggered = triggerFrame(activeFrame, 8)
    const cancelled = cancelFrame(activeFrame, 8)

    expect(canHandleScheduledTokenEvent(activeFrame, 8)).toBe(true)
    expect(canHandleScheduledTokenEvent(activeFrame, 9)).toBe(false)
    expect(staleTriggered).toEqual(activeFrame)
    expect(triggered).toEqual(activeFrame)
    expect(cancelled.status).toBe("cancelled")
  })
})
