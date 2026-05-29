import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action.js"
import { action, enter } from "../action.js"
import { createInitialContext } from "../context.js"
import { debounceAsync, noop, startAsync } from "../effect.js"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  Runtime,
} from "../runtime.js"
import { state } from "../state.js"

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, reject, resolve }
}

describe("flushAsync", () => {
  describe("introspection", () => {
    test("hasPendingAsync returns false when nothing is registered", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>

      const Idle = state<Enter | Save, void, string, string, "save">(
        { Enter: noop, Save: noop },
        { name: "Idle" },
      )

      const context = createInitialContext([Idle(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())

      expect(runtime.hasPendingAsync("save")).toBe(false)
      expect(runtime.getPendingAsyncCount()).toBe(0)
      expect(runtime.getPendingAsync("save")).toBeUndefined()
    })

    test("hasPendingAsync is true while debounce timer is active", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>
      const saved = action("Saved").withPayload<string>()
      type Saved = ActionCreatorType<typeof saved>

      const Editing = state<Enter | Save | Saved, void, string, string, "save">(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(async () => "ok", {
              asyncId: "save",
              delayMs: 100,
            }).chainToAction(saved),
          Saved: noop,
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save, saved },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())

      expect(runtime.hasPendingAsync("save")).toBe(false)

      await runtime.run(save())

      expect(runtime.hasPendingAsync("save")).toBe(true)
      expect(runtime.getPendingAsyncCount()).toBe(1)
      expect(runtime.getPendingAsync("save")).toEqual({
        asyncId: "save",
        phase: "debouncing",
      })

      await timerDriver.advanceBy(100)
      await asyncDriver.flush()

      expect(runtime.hasPendingAsync("save")).toBe(false)
    })

    test("hasPendingAsync is true while async op is in-flight", async () => {
      const load = action("Load")
      type Load = ActionCreatorType<typeof load>
      const loaded = action("Loaded").withPayload<string>()
      type Loaded = ActionCreatorType<typeof loaded>

      const pending = deferred<string>()

      const Idle = state<Enter | Load | Loaded, void, string, string, "load">(
        {
          Enter: noop,
          Load: () =>
            startAsync(() => pending.promise, "load").chainToAction(loaded),
          Loaded: noop,
        },
        { name: "Idle" },
      )

      const context = createInitialContext([Idle(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { load, loaded },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(load())

      expect(runtime.hasPendingAsync("load")).toBe(true)
      expect(runtime.getPendingAsync("load")).toEqual({
        asyncId: "load",
        phase: "in-flight",
      })

      pending.resolve("done")
      await asyncDriver.flush()

      expect(runtime.hasPendingAsync("load")).toBe(false)
    })
  })

  describe("flushAsync", () => {
    test("returns { type: 'nothing' } when asyncId is not pending", async () => {
      const idle = action("Idle")
      type Idle = ActionCreatorType<typeof idle>

      const State = state<Enter | Idle, void, string, string, never>(
        { Enter: noop, Idle: noop },
        { name: "State" },
      )

      const context = createInitialContext([State(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { idle },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())

      const outcome = await runtime.flushAsync("missing")
      expect(outcome).toEqual({ type: "nothing" })
    })

    test("flushes a pending debounce immediately and returns succeeded", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>
      const saved = action("Saved").withPayload<string>()
      type Saved = ActionCreatorType<typeof saved>

      const Editing = state<Enter | Save | Saved, void, string, string, "save">(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(async () => "persisted", {
              asyncId: "save",
              delayMs: 5000,
            }).chainToAction(saved),
          Saved: noop,
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save, saved },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(save())

      expect(runtime.hasPendingAsync("save")).toBe(true)
      expect(runtime.getPendingAsync("save")?.phase).toBe("debouncing")

      // Timer has NOT been advanced; flush bypasses it
      const flushPromise = runtime.flushAsync("save")

      await asyncDriver.flush()

      const outcome = await flushPromise
      expect(outcome).toEqual({ type: "succeeded", value: "persisted" })
      expect(runtime.hasPendingAsync("save")).toBe(false)
    })

    test("flushes a pending debounce and returns failed when run throws", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>

      const boom = new Error("disk full")

      const Editing = state<Enter | Save, void, string, string, "save">(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(() => Promise.reject(boom), {
              asyncId: "save",
              delayMs: 5000,
            }),
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(save())

      const flushPromise = runtime.flushAsync("save")
      await asyncDriver.flush()

      const outcome = await flushPromise
      expect(outcome).toEqual({ type: "failed", error: boom })
    })

    test("awaits an already in-flight startAsync and returns succeeded", async () => {
      const load = action("Load")
      type Load = ActionCreatorType<typeof load>
      const loaded = action("Loaded").withPayload<string>()
      type Loaded = ActionCreatorType<typeof loaded>

      const pending = deferred<string>()

      const Idle = state<Enter | Load | Loaded, void, string, string, "load">(
        {
          Enter: noop,
          Load: () =>
            startAsync(() => pending.promise, "load").chainToAction(loaded),
          Loaded: noop,
        },
        { name: "Idle" },
      )

      const context = createInitialContext([Idle(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { load, loaded },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(load())

      expect(runtime.getPendingAsync("load")?.phase).toBe("in-flight")

      const flushPromise = runtime.flushAsync("load")

      pending.resolve("data")
      await asyncDriver.flush()

      const outcome = await flushPromise
      expect(outcome).toEqual({ type: "succeeded", value: "data" })
    })

    test("cancelAsync after flushAsync resolves flush as aborted", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>
      const cancel = action("Cancel")
      type Cancel = ActionCreatorType<typeof cancel>

      const pending = deferred<string>()

      const Editing = state<
        Enter | Save | Cancel,
        void,
        string,
        string,
        "save"
      >(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(async () => pending.promise, {
              asyncId: "save",
              delayMs: 5000,
            }),
          Cancel: (_, __, { cancelAsync }) => cancelAsync("save" as const),
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save, cancel },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(save())

      const flushPromise = runtime.flushAsync("save")

      // Op starts (timer bypassed), then cancel fires
      await runtime.run(cancel())

      const outcome = await flushPromise
      expect(outcome).toEqual({ type: "aborted" })
    })

    test("cancelAsync before flushAsync: flushAsync returns nothing", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>
      const cancel = action("Cancel")
      type Cancel = ActionCreatorType<typeof cancel>

      const Editing = state<
        Enter | Save | Cancel,
        void,
        string,
        string,
        "save"
      >(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(async () => "ok", {
              asyncId: "save",
              delayMs: 5000,
            }),
          Cancel: (_, __, { cancelAsync }) => cancelAsync("save" as const),
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save, cancel },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(save())
      await runtime.run(cancel())

      const outcome = await runtime.flushAsync("save")
      expect(outcome).toEqual({ type: "nothing" })
    })
  })

  describe("Phase 1: asyncId exclusivity regression", () => {
    test("startAsync with explicit asyncId cancels a pending debounce for the same id", async () => {
      const save = action("Save")
      type Save = ActionCreatorType<typeof save>
      const forceLoad = action("ForceLoad")
      type ForceLoad = ActionCreatorType<typeof forceLoad>
      const loaded = action("Loaded").withPayload<string>()
      type Loaded = ActionCreatorType<typeof loaded>

      const debounceRuns: string[] = []

      const Editing = state<
        Enter | Save | ForceLoad | Loaded,
        void,
        string,
        string,
        "op"
      >(
        {
          Enter: noop,
          Save: () =>
            debounceAsync(
              async () => {
                debounceRuns.push("debounce")
                return "saved"
              },
              { asyncId: "op", delayMs: 5000 },
            ),
          ForceLoad: () =>
            startAsync(async () => "loaded", "op").chainToAction(loaded),
          Loaded: noop,
        },
        { name: "Editing" },
      )

      const context = createInitialContext([Editing(undefined)])
      const asyncDriver = createControlledAsyncDriver()
      const timerDriver = createControlledTimerDriver()
      const runtime = new Runtime(
        context,
        { save, forceLoad, loaded },
        {},
        {
          asyncDriver,
          timerDriver,
        },
      )

      await runtime.run(enter())
      await runtime.run(save())

      expect(runtime.hasPendingAsync("op")).toBe(true)
      expect(runtime.getPendingAsync("op")?.phase).toBe("debouncing")

      // startAsync with the same asyncId should cancel the debounce
      await runtime.run(forceLoad())
      await asyncDriver.flush()

      // Debounce never ran
      expect(debounceRuns).toEqual([])
      // op is now idle
      expect(runtime.hasPendingAsync("op")).toBe(false)
    })
  })
})
