import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action.js"
import { action, enter } from "../action.js"
import { createInitialContext } from "../context.js"
import {
  customJSONAsync,
  debounceAsync,
  requestJSONAsync,
  startAsync,
} from "../effect.js"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  Runtime,
} from "../runtime.js"
import { state } from "../state.js"

type Data = {
  events: string[]
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const createAbortablePendingRun =
  (options?: { onAbort?: () => void; onStart?: () => void }) =>
  (signal: AbortSignal): Promise<string> =>
    new Promise<string>((_resolve, reject) => {
      options?.onStart?.()

      signal.addEventListener(
        "abort",
        () => {
          options?.onAbort?.()
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true },
      )
    })

describe("runtime disconnect async lifecycle", () => {
  test("disconnect aborts startAsync work with an explicit asyncId and discards its result", async () => {
    const loaded = action("Loaded").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Loaded = ActionCreatorType<typeof loaded>
    type Failed = ActionCreatorType<typeof failed>
    type LoadingAction = Enter | Loaded | Failed

    let aborted = false

    const Loading = state<LoadingAction, Data, string, string, "load">(
      {
        Enter: () =>
          startAsync(
            createAbortablePendingRun({
              onAbort: () => {
                aborted = true
              },
            }),
            "load",
          ).chainToAction(loaded, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Loaded: (data, payload, { update }) =>
          update(appendEvent(data, `loaded:${payload}`)),
      },
      { name: "Loading" },
    )

    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      createInitialContext([Loading({ events: [] })]),
      { failed, loaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())

    runtime.disconnect()
    await asyncDriver.flush()

    expect(aborted).toBe(true)
    expect(runtime.currentState().data.events).toEqual([])
    expect(() => runtime.assertCleanTeardown()).not.toThrow()
  })

  test("disconnect aborts startAsync work without an explicit asyncId and discards its result", async () => {
    const loaded = action("Loaded").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Loaded = ActionCreatorType<typeof loaded>
    type Failed = ActionCreatorType<typeof failed>
    type LoadingAction = Enter | Loaded | Failed

    let aborted = false

    const Loading = state<LoadingAction, Data>(
      {
        Enter: () =>
          startAsync(
            createAbortablePendingRun({
              onAbort: () => {
                aborted = true
              },
            }),
          ).chainToAction(loaded, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Loaded: (data, payload, { update }) =>
          update(appendEvent(data, `loaded:${payload}`)),
      },
      { name: "Loading" },
    )

    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      createInitialContext([Loading({ events: [] })]),
      { failed, loaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())

    runtime.disconnect()
    await asyncDriver.flush()

    expect(aborted).toBe(true)
    expect(runtime.currentState().data.events).toEqual([])
    expect(() => runtime.assertCleanTeardown()).not.toThrow()
  })

  test("disconnect clears a pending debounce before it starts running", async () => {
    const saved = action("Saved").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Saved = ActionCreatorType<typeof saved>
    type Failed = ActionCreatorType<typeof failed>
    type EditingAction = Enter | Saved | Failed

    let started = false

    const Editing = state<EditingAction, Data, string, string, "save">(
      {
        Enter: () =>
          debounceAsync(
            async () => {
              started = true

              return "saved"
            },
            {
              asyncId: "save",
              delayMs: 100,
            },
          ).chainToAction(saved, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Saved: (data, payload, { update }) =>
          update(appendEvent(data, `saved:${payload}`)),
      },
      { name: "Editing" },
    )

    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      createInitialContext([Editing({ events: [] })]),
      { failed, saved },
      {},
      { asyncDriver, timerDriver },
    )

    await runtime.run(enter())

    expect(runtime.getPendingAsync("save")).toEqual({
      asyncId: "save",
      phase: "debouncing",
    })

    runtime.disconnect()
    await timerDriver.advanceBy(100)
    await asyncDriver.flush()

    expect(started).toBe(false)
    expect(runtime.currentState().data.events).toEqual([])
    expect(() => runtime.assertCleanTeardown()).not.toThrow()
  })

  test("disconnect aborts a debounced async after the timer fires and discards its result", async () => {
    const saved = action("Saved").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Saved = ActionCreatorType<typeof saved>
    type Failed = ActionCreatorType<typeof failed>
    type EditingAction = Enter | Saved | Failed

    let aborted = false

    const Editing = state<EditingAction, Data, string, string, "save">(
      {
        Enter: () =>
          debounceAsync(
            createAbortablePendingRun({
              onAbort: () => {
                aborted = true
              },
            }),
            {
              asyncId: "save",
              delayMs: 10,
            },
          ).chainToAction(saved, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Saved: (data, payload, { update }) =>
          update(appendEvent(data, `saved:${payload}`)),
      },
      { name: "Editing" },
    )

    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      createInitialContext([Editing({ events: [] })]),
      { failed, saved },
      {},
      { asyncDriver, timerDriver },
    )

    await runtime.run(enter())
    await timerDriver.advanceBy(10)

    expect(runtime.getPendingAsync("save")).toEqual({
      asyncId: "save",
      phase: "in-flight",
    })

    runtime.disconnect()
    await asyncDriver.flush()

    expect(aborted).toBe(true)
    expect(runtime.currentState().data.events).toEqual([])
    expect(() => runtime.assertCleanTeardown()).not.toThrow()
  })

  test("disconnect aborts customJSONAsync work and discards its result", async () => {
    const loaded = action("Loaded").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Loaded = ActionCreatorType<typeof loaded>
    type Failed = ActionCreatorType<typeof failed>
    type LoadingAction = Enter | Loaded | Failed

    let aborted = false

    const Loading = state<LoadingAction, Data>(
      {
        Enter: () =>
          customJSONAsync(
            createAbortablePendingRun({
              onAbort: () => {
                aborted = true
              },
            }),
          ).chainToAction(loaded, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Loaded: (data, payload, { update }) =>
          update(appendEvent(data, `loaded:${payload}`)),
      },
      { name: "Loading" },
    )

    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      createInitialContext([Loading({ events: [] })]),
      { failed, loaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())

    runtime.disconnect()
    await asyncDriver.flush()

    expect(aborted).toBe(true)
    expect(runtime.currentState().data.events).toEqual([])
    expect(() => runtime.assertCleanTeardown()).not.toThrow()
  })

  test("disconnect aborts requestJSONAsync work and discards its result", async () => {
    const loaded = action("Loaded").withPayload<string>()
    const failed = action("Failed").withPayload<string>()
    type Loaded = ActionCreatorType<typeof loaded>
    type Failed = ActionCreatorType<typeof failed>
    type LoadingAction = Enter | Loaded | Failed

    let aborted = false
    const originalFetch = globalThis.fetch

    const Loading = state<LoadingAction, Data>(
      {
        Enter: () =>
          requestJSONAsync("/api/profile").chainToAction(loaded, error =>
            failed(error instanceof Error ? error.message : String(error)),
          ),
        Failed: (data, payload, { update }) =>
          update(appendEvent(data, `failed:${payload}`)),
        Loaded: (data, payload, { update }) =>
          update(appendEvent(data, `loaded:${payload}`)),
      },
      { name: "Loading" },
    )

    globalThis.fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted = true
        },
        { once: true },
      )

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"))
          },
          { once: true },
        )
      })
    }

    try {
      const asyncDriver = createControlledAsyncDriver()
      const runtime = new Runtime(
        createInitialContext([Loading({ events: [] })]),
        { failed, loaded },
        {},
        { asyncDriver },
      )

      await runtime.run(enter())

      runtime.disconnect()
      await asyncDriver.flush()

      expect(aborted).toBe(true)
      expect(runtime.currentState().data.events).toEqual([])
      expect(() => runtime.assertCleanTeardown()).not.toThrow()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
