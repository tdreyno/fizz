import { describe, expect, test } from "@jest/globals"

import { action } from "../action"
import { createMachine } from "../createMachine"
import {
  commandEffect,
  debounceAsync,
  resource,
  startAsync,
  startFrame,
  startTimer,
} from "../effect"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  createRuntime,
} from "../runtime"
import { state } from "../state"

describe("runtime diagnostics", () => {
  test("getDiagnosticsSnapshot returns active runtime diagnostics", async () => {
    type Commands = {
      drag: {
        preview: {
          payload: { x: number }
          result: "ok"
        }
      }
    }

    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, { status: string }>(
      {
        Start: () => [
          startAsync(() => new Promise<string>(() => undefined), "profile"),
          startTimer("autosave", 1_000),
          resource("session", "abc-123"),
          resource("dom:listen:window:pointermove:1", true),
          commandEffect<Commands, "drag", "preview">(
            "drag",
            "preview",
            { x: 10 },
            { latestOnlyKey: "drag-preview" },
          ),
        ],
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle({ status: "ready" }),
      {
        commandHandlers: {
          drag: {
            preview: () => new Promise<string>(() => undefined),
          },
        },
      },
    )

    await runtime.run(start())

    const snapshot = runtime.getDiagnosticsSnapshot()

    expect(snapshot.asyncOps).toEqual(
      expect.arrayContaining([{ id: "profile", status: "running" }]),
    )
    expect(snapshot.timers).toEqual(
      expect.arrayContaining([{ id: "autosave", kind: "timeout" }]),
    )
    expect(snapshot.resources).toEqual(
      expect.arrayContaining([
        { key: "session", stateName: "Idle" },
        { key: "dom:listen:window:pointermove:1", stateName: "Idle" },
      ]),
    )
    expect(snapshot.listeners).toEqual([
      { count: 1, target: "window", type: "pointermove" },
    ])
    expect(snapshot.channelQueues).toEqual([{ channel: "drag", queued: 1 }])

    runtime.disconnect()
  })

  test("assertCleanTeardown throws when disallowed diagnostics remain", async () => {
    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, undefined>(
      {
        Start: () => startTimer("autosave", 1_000),
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle(undefined),
      {
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(start())

    expect(() => runtime.assertCleanTeardown()).toThrow(
      /Runtime teardown is not clean\. timers: 1 active/,
    )
    expect(() =>
      runtime.assertCleanTeardown({ allow: { timers: true } }),
    ).not.toThrow()

    runtime.disconnect()
  })

  test("assertCleanTeardown passes after disconnect", async () => {
    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, undefined>(
      {
        Start: () => [
          startAsync(() => new Promise<string>(() => undefined), "profile"),
          startTimer("autosave", 1_000),
          resource("session", "abc-123"),
        ],
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle(undefined),
      {
        asyncDriver: createControlledAsyncDriver(),
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(start())

    runtime.disconnect()

    expect(() => runtime.assertCleanTeardown()).not.toThrow()
    expect(runtime.getDiagnosticsSnapshot()).toEqual({
      asyncOps: [],
      channelQueues: [],
      listeners: [],
      resources: [],
      timers: [],
    })
  })

  test("listener diagnostics include grouped and unknown listener resources", async () => {
    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, undefined>(
      {
        Start: () => [
          resource("dom:listen:window:scroll:1", true),
          resource("dom:listen:group:keydown:bubble:active:group:1", true),
          resource("dom:listen:bad", true),
        ],
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle(undefined),
    )

    await runtime.run(start())

    expect(runtime.getDiagnosticsSnapshot().listeners).toEqual([
      { count: 1, target: "group", type: "keydown" },
      { count: 1, target: "unknown", type: "unknown" },
      { count: 1, target: "window", type: "scroll" },
    ])

    runtime.disconnect()
  })

  test("diagnostics track debounced async operations", async () => {
    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, undefined>(
      {
        Start: () =>
          debounceAsync(() => Promise.resolve("ok"), {
            asyncId: "search",
            delayMs: 1_000,
          }),
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle(undefined),
      {
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(start())

    expect(runtime.getDiagnosticsSnapshot().asyncOps).toEqual([
      { id: "search", status: "debouncing" },
    ])

    runtime.disconnect()
  })

  test("diagnostics include active frame scheduling", async () => {
    const start = action("Start")

    const Idle = state<ReturnType<typeof start>, undefined>(
      {
        Start: () => startFrame(),
      },
      { name: "Idle" },
    )

    const runtime = createRuntime(
      createMachine({
        actions: { start },
        states: { Idle },
      }),
      Idle(undefined),
      {
        timerDriver: createControlledTimerDriver(),
      },
    )

    await runtime.run(start())

    expect(runtime.getDiagnosticsSnapshot().timers).toEqual([
      { id: "frame", kind: "frame" },
    ])

    runtime.disconnect()
  })
})
