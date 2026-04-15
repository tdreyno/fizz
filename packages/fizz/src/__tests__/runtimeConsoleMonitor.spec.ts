import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action"
import {
  createRuntimeConsoleMonitor,
  formatRuntimeDebugEvent,
} from "../runtimeDebug"

describe("runtime console monitor", () => {
  test("should format runtime events into readable console entries", () => {
    const trigger = action("Trigger")

    expect(
      formatRuntimeDebugEvent({
        action: trigger(),
        queueSize: 2,
        type: "action-enqueued",
      }),
    ).toEqual({
      args: [
        "[Fizz] Enqueue action Trigger",
        {
          payload: undefined,
          queueSize: 2,
        },
      ],
      level: "log",
    })
  })

  test("should format runtime errors and async rejections as error-level entries", () => {
    const explode = action("Explode")
    const error = new Error("boom")

    expect(
      formatRuntimeDebugEvent({
        command: {
          action: explode(),
          kind: "action",
        },
        error,
        type: "runtime-error",
      }),
    ).toEqual({
      args: ["[Fizz] Runtime error in action Explode", error],
      level: "error",
    })

    expect(
      formatRuntimeDebugEvent({
        asyncId: "profile",
        error,
        type: "async-rejected",
      }),
    ).toEqual({
      args: ["[Fizz] Async rejected profile", error],
      level: "error",
    })
  })

  test("should create a monitor that routes formatted entries to the provided console", () => {
    const log = jest.fn()
    const error = jest.fn()
    const warn = jest.fn()
    const monitor = createRuntimeConsoleMonitor({
      console: { error, log, warn },
      prefix: "[Fizz Test]",
    })

    monitor({
      delay: 50,
      timeoutId: "autosave",
      type: "timer-started",
    })

    monitor({
      asyncId: "audit",
      error: new Error("nope"),
      type: "async-rejected",
    })

    expect(log).toHaveBeenCalledWith("[Fizz Test] Timer started autosave", {
      delay: 50,
    })
    expect(error).toHaveBeenCalledWith(
      "[Fizz Test] Async rejected audit",
      expect.objectContaining({
        message: "nope",
      }),
    )
    expect(warn).not.toHaveBeenCalled()
  })
})
