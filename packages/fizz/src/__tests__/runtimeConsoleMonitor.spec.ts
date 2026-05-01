import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action"
import { output } from "../effect"
import {
  createRuntimeConsoleMonitor,
  formatRuntimeDebugEvent,
} from "../runtimeDebug"

describe("runtime console monitor", () => {
  test("should serialize deep objects when using the default console", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined)
    const monitor = createRuntimeConsoleMonitor()

    monitor({
      action: action("Trigger")({
        details: {
          nested: {
            count: 2,
          },
        },
      }),
      queueSize: 1,
      type: "action-enqueued",
    })

    expect(log).toHaveBeenCalledWith(
      "[Fizz] Enqueue action Trigger",
      JSON.stringify(
        {
          payload: {
            details: {
              nested: {
                count: 2,
              },
            },
          },
          queueSize: 1,
        },
        null,
        2,
      ),
    )

    log.mockRestore()
  })

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

  test("should format context changes with state name and data only", () => {
    expect(
      formatRuntimeDebugEvent({
        context: {
          actionQueue: [],
          args: undefined,
          asyncs: {},
          currentState: {
            data: { count: 1 },
            executor: () => [],
            isNamed: () => true,
            isStateTransition: true,
            mode: "append",
            name: "B",
            state: (() => {
              throw new Error("state should not be logged")
            }) as never,
          },
          frame: undefined,
          intervals: {},
          outputs: [],
          previousState: undefined,
          schedules: [],
          timers: {},
        },
        currentState: {
          data: { count: 1 },
          executor: () => [],
          isNamed: () => true,
          isStateTransition: true,
          mode: "append",
          name: "B",
          state: (() => {
            throw new Error("state should not be logged")
          }) as never,
        },
        previousState: {
          data: { count: 0 },
          executor: () => [],
          isNamed: () => true,
          isStateTransition: true,
          mode: "append",
          name: "A",
          state: (() => {
            throw new Error("state should not be logged")
          }) as never,
        },
        type: "context-changed",
      }),
    ).toEqual({
      args: [
        "[Fizz] Context A -> B",
        {
          currentState: {
            data: { count: 1 },
            name: "B",
          },
          previousState: {
            data: { count: 0 },
            name: "A",
          },
        },
      ],
      level: "log",
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

  test("should serialize circular payloads with the default console", () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined)
    const payload: { name: string; self?: unknown } = { name: "job" }

    payload.self = payload

    createRuntimeConsoleMonitor()({
      channel: "jobs",
      commandType: "sync",
      payload,
      type: "imperative-command-started",
    })

    expect(log).toHaveBeenCalledWith(
      "[Fizz] Imperative command started jobs.sync",
      JSON.stringify(
        {
          name: "job",
          self: "[Circular]",
        },
        null,
        2,
      ),
    )

    log.mockRestore()
  })

  test("should format timer, frame, resource, and warning events", () => {
    expect(
      formatRuntimeDebugEvent({
        delay: 25,
        reason: "restart",
        timeoutId: "autosave",
        type: "timer-cancelled",
      }),
    ).toEqual({
      args: [
        "[Fizz] Timer cancelled autosave",
        {
          delay: 25,
          reason: "restart",
        },
      ],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({ type: "frame-triggered", timestamp: 10 }),
    ).toEqual({
      args: ["[Fizz] Frame triggered", { timestamp: 10 }],
      level: "log",
    })

    const error = new Error("release failed")

    expect(
      formatRuntimeDebugEvent({
        error,
        reason: "cleanup",
        resourceKey: "profile",
        stateName: "Loading",
        type: "resource-release-failed",
      }),
    ).toEqual({
      args: [
        "[Fizz] Resource release failed profile",
        {
          reason: "cleanup",
          stateName: "Loading",
        },
        error,
      ],
      level: "error",
    })
  })

  test("should route warning entries to a provided console", () => {
    const error = jest.fn()
    const log = jest.fn()
    const warn = jest.fn()

    createRuntimeConsoleMonitor({ console: { error, log, warn } })({
      channel: "jobs",
      commandType: "sync",
      policy: "warn",
      type: "imperative-command-missing-handler",
    })

    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      "[Fizz] Imperative command missing handler jobs.sync",
      { policy: "warn" },
    )
  })

  test("should format the remaining runtime event variants", () => {
    const notice = action("Notice").withPayload<string>()
    const loadingState = {
      data: { count: 1 },
      executor: () => [],
      isNamed: () => true,
      isStateTransition: true,
      mode: "append" as const,
      name: "Loading",
      state: (() => {
        throw new Error("state should not be logged")
      }) as never,
    }
    const effectCommand = {
      effect: output(notice("done")),
      kind: "effect" as const,
    }
    const stateCommand = {
      kind: "state" as const,
      state: loadingState,
    }
    const error = new Error("failed")

    expect(
      formatRuntimeDebugEvent({ asyncId: "profile", type: "async-started" }),
    ).toEqual({
      args: ["[Fizz] Async started profile"],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        asyncId: "profile",
        reason: "cleanup",
        type: "async-cancelled",
      }),
    ).toEqual({
      args: ["[Fizz] Async cancelled profile", { reason: "cleanup" }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        asyncId: "profile",
        type: "async-resolved",
        value: "Ada",
      }),
    ).toEqual({
      args: ["[Fizz] Async resolved profile", "Ada"],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        command: stateCommand,
        queueSize: 3,
        type: "command-started",
      }),
    ).toEqual({
      args: ["[Fizz] Start state Loading", { queueSize: 3 }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        command: effectCommand,
        generatedCommands: [stateCommand, effectCommand],
        type: "command-completed",
      }),
    ).toEqual({
      args: [
        "[Fizz] Complete effect output",
        {
          generatedCommands: ["state Loading", "effect output"],
        },
      ],
      level: "log",
    })

    expect(formatRuntimeDebugEvent({ type: "frame-started" })).toEqual({
      args: ["[Fizz] Frame started"],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({ reason: "effect", type: "frame-cancelled" }),
    ).toEqual({
      args: ["[Fizz] Frame cancelled", { reason: "effect" }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        delay: 20,
        intervalId: "poll",
        type: "interval-started",
      }),
    ).toEqual({
      args: ["[Fizz] Interval started poll", { delay: 20 }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        delay: 20,
        intervalId: "poll",
        type: "interval-triggered",
      }),
    ).toEqual({
      args: ["[Fizz] Interval triggered poll", { delay: 20 }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        delay: 20,
        intervalId: "poll",
        reason: "restart",
        type: "interval-cancelled",
      }),
    ).toEqual({
      args: [
        "[Fizz] Interval cancelled poll",
        {
          delay: 20,
          reason: "restart",
        },
      ],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        delay: 40,
        timeoutId: "autosave",
        type: "timer-completed",
      }),
    ).toEqual({
      args: ["[Fizz] Timer completed autosave", { delay: 40 }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        output: notice("done"),
        type: "output-emitted",
      }),
    ).toEqual({
      args: ["[Fizz] Output Notice", notice("done")],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        resourceKey: "profile",
        stateName: "Loading",
        type: "resource-registered",
      }),
    ).toEqual({
      args: ["[Fizz] Resource registered profile", { stateName: "Loading" }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        reason: "effect",
        resourceKey: "profile",
        stateName: "Loading",
        type: "resource-released",
      }),
    ).toEqual({
      args: [
        "[Fizz] Resource released profile",
        {
          reason: "effect",
          stateName: "Loading",
        },
      ],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        channel: "jobs",
        commandType: "sync",
        result: { ok: true },
        type: "imperative-command-completed",
      }),
    ).toEqual({
      args: ["[Fizz] Imperative command completed jobs.sync", { ok: true }],
      level: "log",
    })

    expect(
      formatRuntimeDebugEvent({
        channel: "jobs",
        commandType: "sync",
        error,
        type: "imperative-command-failed",
      }),
    ).toEqual({
      args: ["[Fizz] Imperative command failed jobs.sync", error],
      level: "error",
    })
  })
})
