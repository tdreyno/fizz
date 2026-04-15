import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { output } from "../effect"
import type { RuntimeDebugEvent } from "../runtime"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  createRuntime,
} from "../runtime"
import { state } from "../state"
import { deferred } from "../test"

describe("runtime monitor", () => {
  test("should emit debug events for actions, outputs, and context changes", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const notice = action("Notice").withPayload<string>()

    const A = state<Trigger, { events: string[] }>(
      {
        Trigger: (data, _, { update }) => [
          update({
            events: [...data.events, "triggered"],
          }),
          output(notice("triggered")),
        ],
      },
      { name: "A" },
    )

    const events: RuntimeDebugEvent[] = []
    const context = createInitialContext([A({ events: [] })])
    const runtime = createRuntime(
      context,
      { trigger },
      { notice },
      {
        monitor: event => {
          events.push(event)
        },
      },
    )

    await runtime.run(trigger())

    expect(events[0]).toMatchObject({
      type: "action-enqueued",
      action: trigger(),
      queueSize: 1,
    })

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "command-started",
          command: expect.objectContaining({
            kind: "action",
            action: expect.objectContaining({
              type: "Trigger",
            }),
          }),
        }),
      ]),
    )

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "command-completed",
          command: expect.objectContaining({
            kind: "action",
          }),
          generatedCommands: expect.arrayContaining([
            expect.objectContaining({
              kind: "state",
              state: expect.objectContaining({
                name: "A",
              }),
            }),
          ]),
        }),
      ]),
    )

    expect(events).toContainEqual({
      type: "output-emitted",
      output: notice("triggered"),
    })

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "context-changed",
          currentState: expect.objectContaining({
            name: "A",
            data: expect.objectContaining({
              events: ["triggered"],
            }),
          }),
          previousState: expect.objectContaining({
            name: "A",
            data: expect.objectContaining({
              events: [],
            }),
          }),
        }),
      ]),
    )
  })

  test("should emit runtime errors without swallowing them", async () => {
    const explode = action("Explode")
    const error = new Error("boom")

    const A = state<ActionCreatorType<typeof explode>, undefined>(
      {
        Explode: () => {
          throw error
        },
      },
      { name: "A" },
    )

    const events: RuntimeDebugEvent[] = []
    const context = createInitialContext([A(undefined)])
    const runtime = createRuntime(
      context,
      { explode },
      {},
      {
        monitor: event => {
          events.push(event)
        },
      },
    )

    await expect(runtime.run(explode())).rejects.toThrow("boom")

    expect(events).toContainEqual({
      type: "runtime-error",
      command: {
        kind: "action",
        action: explode(),
      },
      error,
    })
  })

  test("should emit async started, resolved, and rejected events", async () => {
    type AsyncId = "audit" | "profile"

    const profile = deferred<string>()
    const audit = deferred<string>()

    const Loading = state<Enter, undefined, string, string, AsyncId>(
      {
        Enter: (_, __, { startAsync }) => [
          startAsync(profile.promise, {}, "profile"),
          startAsync(audit.promise, {}, "audit"),
        ],
      },
      { name: "Loading" },
    )

    const events: RuntimeDebugEvent[] = []
    const context = createInitialContext([Loading(undefined)])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = createRuntime(
      context,
      {},
      {},
      {
        asyncDriver,
        monitor: event => {
          events.push(event)
        },
      },
    )

    await runtime.run(enter())

    profile.resolve("Ada")
    audit.reject("boom")

    await asyncDriver.flush()
    await asyncDriver.runAll()

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "async-started", asyncId: "profile" },
        { type: "async-started", asyncId: "audit" },
        {
          type: "async-resolved",
          asyncId: "profile",
          value: "Ada",
        },
      ]),
    )

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "async-rejected",
          asyncId: "audit",
          error: expect.objectContaining({
            message: "boom",
          }),
        }),
      ]),
    )
  })

  test("should emit async cancelled events", async () => {
    const cancelSettings = action("CancelSettings")
    type CancelSettings = ActionCreatorType<typeof cancelSettings>

    type AsyncId = "settings"

    const settings = deferred<string>()

    const Loading = state<
      Enter | CancelSettings,
      undefined,
      string,
      string,
      AsyncId
    >(
      {
        Enter: (_, __, { startAsync }) =>
          startAsync(settings.promise, {}, "settings"),

        CancelSettings: (_, __, { cancelAsync }) => cancelAsync("settings"),
      },
      { name: "Loading" },
    )

    const events: RuntimeDebugEvent[] = []
    const context = createInitialContext([Loading(undefined)])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = createRuntime(
      context,
      { cancelSettings },
      {},
      {
        asyncDriver,
        monitor: event => {
          events.push(event)
        },
      },
    )

    await runtime.run(enter())
    await runtime.run(cancelSettings())
    await asyncDriver.flush()

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "async-started", asyncId: "settings" },
        {
          type: "async-cancelled",
          asyncId: "settings",
          reason: "effect",
        },
      ]),
    )
  })

  test("should emit timer, interval, and frame lifecycle events", async () => {
    const Polling = state<
      Enter,
      { frameCount: number; intervalCount: number },
      "autosave",
      "poll"
    >(
      {
        Enter: (_, __, { startFrame, startInterval, startTimer }) => [
          startTimer("autosave", 10),
          startInterval("poll", 5),
          startFrame(),
        ],

        TimerCompleted: (data, _, { update }) =>
          update({
            ...data,
          }),

        IntervalTriggered: (data, _, { cancelInterval, update }) => {
          const nextData = {
            ...data,
            intervalCount: data.intervalCount + 1,
          }

          return nextData.intervalCount >= 2
            ? [update(nextData), cancelInterval("poll")]
            : update(nextData)
        },

        OnFrame: (data, _timestamp, { cancelFrame, update }) => {
          const nextData = {
            ...data,
            frameCount: data.frameCount + 1,
          }

          return nextData.frameCount >= 2
            ? [update(nextData), cancelFrame()]
            : update(nextData)
        },
      },
      { name: "Polling" },
    )

    const events: RuntimeDebugEvent[] = []
    const context = createInitialContext([
      Polling({ frameCount: 0, intervalCount: 0 }),
    ])
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(
      context,
      {},
      {},
      {
        timerDriver,
        monitor: event => {
          events.push(event)
        },
      },
    )

    await runtime.run(enter())
    await timerDriver.advanceFrames(2, 10)
    await timerDriver.advanceBy(12)

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "timer-started", timeoutId: "autosave", delay: 10 },
        { type: "timer-completed", timeoutId: "autosave", delay: 10 },
        { type: "interval-started", intervalId: "poll", delay: 5 },
        { type: "interval-triggered", intervalId: "poll", delay: 5 },
        {
          type: "interval-cancelled",
          intervalId: "poll",
          delay: 5,
          reason: "effect",
        },
        { type: "frame-started" },
        { type: "frame-triggered", timestamp: 10 },
        { type: "frame-cancelled", reason: "effect" },
      ]),
    )
  })
})
