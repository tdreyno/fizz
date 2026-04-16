import { describe, expect, test } from "@jest/globals"
import {
  action,
  createControlledTimerDriver,
  createMachine,
  createRuntime,
  enter,
  FIZZ_CHROME_DEBUGGER_HOOK_KEY,
  output,
  state,
} from "@tdreyno/fizz"

import type { FizzDebuggerMessage } from "../index.js"
import {
  createFizzChromeDebugger,
  installFizzChromeDebuggerHook,
  serializeForDebugger,
} from "../index.js"

describe("fizz chrome debugger", () => {
  test("serializes circular values, errors, and functions safely", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    const value = serializeForDebugger({
      circular,
      error: new Error("boom"),
      fn: function sample() {
        return "ok"
      },
      missing: undefined,
      symbol: Symbol("machine"),
    })

    expect(value).toEqual({
      circular: {
        self: "[Circular]",
      },
      error: expect.objectContaining({
        message: "boom",
        name: "Error",
      }),
      fn: "[Function sample]",
      missing: "[Undefined]",
      symbol: "Symbol(machine)",
    })
  })

  test("registers runtimes, records timeline updates, and tracks scheduled work", async () => {
    const trigger = action("Trigger")
    const notice = action("Notice").withPayload<string>()

    type Trigger = ReturnType<typeof trigger>

    const Ready = state<Trigger, { count: number }, "toast">(
      {
        Trigger: (data, _, { startTimer, update }) => [
          update({
            count: data.count + 1,
          }),
          output(notice("updated")),
          startTimer("toast", 25),
        ],
        TimerCompleted: (data, _, { update }) =>
          update({
            count: data.count + 10,
          }),
      },
      { name: "Ready" },
    )

    const messages: FizzDebuggerMessage[] = []
    const chromeDebugger = createFizzChromeDebugger({
      now: (() => {
        let counter = 100

        return () => counter++
      })(),
      transport: {
        emit: message => {
          messages.push(message)
        },
      },
    })
    const runtimeId = chromeDebugger.nextRuntimeId("Timeout Demo")
    const machine = createMachine({
      actions: { trigger },
      outputActions: { notice },
      states: { Ready },
    })
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(machine, Ready({ count: 0 }), {
      monitor: chromeDebugger.createMonitor(runtimeId),
      timerDriver,
    })

    const stop = chromeDebugger.registerRuntime({
      label: "Timeout Demo",
      runtime,
      runtimeId,
    })

    await runtime.run(trigger())

    const snapshotAfterTrigger = chromeDebugger.snapshot(runtimeId)

    expect(snapshotAfterTrigger).toMatchObject({
      currentState: {
        data: {
          count: 1,
        },
        name: "Ready",
      },
      hasMonitor: true,
      label: "Timeout Demo",
      runtimeId,
      scheduled: [
        {
          delay: 25,
          id: "toast",
          kind: "timer",
        },
      ],
    })

    expect(snapshotAfterTrigger?.timeline.map(entry => entry.type)).toEqual(
      expect.arrayContaining([
        "action-enqueued",
        "command-started",
        "command-completed",
        "output-emitted",
        "timer-started",
      ]),
    )

    await timerDriver.advanceBy(25)

    const snapshotAfterTimer = chromeDebugger.snapshot(runtimeId)

    expect(snapshotAfterTimer).toMatchObject({
      currentState: {
        data: {
          count: 11,
        },
      },
      scheduled: [],
    })

    expect(messages[0]).toMatchObject({
      kind: "runtime-connected",
      snapshot: {
        runtimeId,
      },
    })

    stop()

    expect(messages.at(-1)).toEqual({
      kind: "runtime-disconnected",
      runtimeId,
      source: "@tdreyno/fizz-chrome-debugger",
    })
  })

  test("installs a global hook that auto-registers createRuntime runtimes", async () => {
    const trigger = action("Trigger")
    const messages: FizzDebuggerMessage[] = []

    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )

    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "AutoMachine",
    )

    const hookTarget = globalThis as typeof globalThis & {
      [FIZZ_CHROME_DEBUGGER_HOOK_KEY]?: unknown
    }
    const { chromeDebugger, uninstall } = installFizzChromeDebuggerHook({
      debuggerOptions: {
        now: (() => {
          let counter = 500

          return () => counter++
        })(),
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      target: hookTarget,
    })

    const runtime = createRuntime(machine, Ready({ count: 0 }))

    await runtime.run(enter())
    await runtime.run(trigger())

    const connected = messages.find(
      message => message.kind === "runtime-connected",
    )

    expect(connected).toMatchObject({
      kind: "runtime-connected",
      snapshot: {
        label: "AutoMachine",
      },
    })

    const runtimeId =
      connected?.kind === "runtime-connected"
        ? connected.snapshot.runtimeId
        : undefined

    expect(runtimeId).toBeDefined()
    expect(
      runtimeId ? chromeDebugger.snapshot(runtimeId) : undefined,
    ).toMatchObject({
      currentState: {
        data: {
          count: 1,
        },
      },
      hasMonitor: true,
      label: "AutoMachine",
    })

    runtime.disconnect()
    uninstall()

    expect(hookTarget[FIZZ_CHROME_DEBUGGER_HOOK_KEY]).toBeUndefined()
  })
})
