import { describe, expect, test } from "@jest/globals"

import { action } from "../action.js"
import { createControlledAsyncDriver } from "../runtime/asyncDriver.js"
import { createRuntimeAsyncModule } from "../runtime/runtimeAsyncModule.js"
import type { RuntimeDebugEvent } from "../runtime/runtimeContracts.js"
import { createControlledTimerDriver } from "../runtime/timerDriver.js"

type RuntimeStateStub = {
  name: string
}

type LeakyTimerDriver = {
  cancel: (handle: unknown) => void
  start: (delay: number, onElapsed: () => Promise<void> | void) => unknown
  startFrame: (
    onFrame: (timestamp: number) => Promise<void> | void,
    options?: { loop?: boolean },
  ) => unknown
  startInterval: (
    delay: number,
    onElapsed: () => Promise<void> | void,
  ) => unknown
  trigger: (handle: number) => Promise<void>
}

const createLeakyTimerDriver = (): LeakyTimerDriver => {
  let counter = 1
  const callbacks = new Map<number, () => Promise<void> | void>()

  return {
    cancel: () => undefined,
    start: (_delay, onElapsed) => {
      const id = counter++

      callbacks.set(id, onElapsed)

      return id
    },
    startFrame: () => counter++,
    startInterval: (delay, onElapsed) => {
      void delay
      void onElapsed

      return counter++
    },
    trigger: async handle => {
      const callback = callbacks.get(handle)

      if (!callback) {
        return
      }

      await callback()
    },
  }
}

const createState = (name: string): RuntimeStateStub => ({
  name,
})

describe("runtimeAsyncModule", () => {
  test("emits restart cancellation when startAsync reuses an active async id", () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const monitorEvents: RuntimeDebugEvent[] = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: event => {
        monitorEvents.push(event)
      },
      getContext: () => ({}) as never,
      runAction: async () => undefined,
      timerDriver,
    })

    const startHandler = module.effectHandlers.get("startAsync")

    startHandler?.({
      data: {
        asyncId: "load",
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => new Promise<string>(() => undefined),
      },
      label: "startAsync",
    } as never)

    startHandler?.({
      data: {
        asyncId: "load",
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => new Promise<string>(() => undefined),
      },
      label: "startAsync",
    } as never)

    expect(monitorEvents).toEqual(
      expect.arrayContaining([
        {
          asyncId: "load",
          reason: "restart",
          type: "async-cancelled",
        },
      ]),
    )
  })

  test("returns asyncCancelled command for emitCancelled debounce restarts", async () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: () => undefined,
      getContext: () => ({}) as never,
      runAction: async () => undefined,
      timerDriver,
    })

    const startHandler = module.effectHandlers.get("startAsync")
    const debounceHandler = module.effectHandlers.get("debounceAsync")

    startHandler?.({
      data: {
        asyncId: "save",
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => new Promise<string>(() => undefined),
      },
      label: "startAsync",
    } as never)

    expect(
      debounceHandler?.({
        data: {
          asyncId: "save",
          delayMs: 0,
          emitCancelled: true,
          handlers: {
            resolve: () => undefined,
          },
          run: async () => "first",
        },
        label: "debounceAsync",
      } as never),
    ).toEqual([])

    await timerDriver.advanceBy(0)

    expect(
      debounceHandler?.({
        data: {
          asyncId: "save",
          delayMs: 0,
          emitCancelled: true,
          handlers: {
            resolve: () => undefined,
          },
          run: async () => "second",
        },
        label: "debounceAsync",
      } as never),
    ).toEqual(["AsyncCancelled"])
  })

  test("returns no command when cancelAsync has nothing to cancel", () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const monitorEvents: RuntimeDebugEvent[] = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: event => {
        monitorEvents.push(event)
      },
      getContext: () => ({}) as never,
      runAction: async () => undefined,
      timerDriver,
    })

    const cancelHandler = module.effectHandlers.get("cancelAsync")

    expect(
      cancelHandler?.({
        data: {
          asyncId: "missing",
        },
        label: "cancelAsync",
      } as never),
    ).toEqual([])

    expect(monitorEvents).toEqual([])
  })

  test("keeps debounce metadata while a running async with same id resolves", async () => {
    const DebouncedResolved = action("DebouncedResolved").withPayload<string>()
    const StartedResolved = action("StartedResolved").withPayload<string>()
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runActionCalls: Array<string> = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: () => undefined,
      getContext: () => ({}) as never,
      runAction: async actionToRun => {
        runActionCalls.push(actionToRun.type)
      },
      timerDriver,
    })

    const startHandler = module.effectHandlers.get("startAsync")
    const debounceHandler = module.effectHandlers.get("debounceAsync")

    debounceHandler?.({
      data: {
        asyncId: "shared",
        delayMs: 10,
        handlers: {
          resolve: (value: string) => DebouncedResolved(value),
        },
        run: async () => "debounced",
      },
      label: "debounceAsync",
    } as never)

    startHandler?.({
      data: {
        asyncId: "shared",
        handlers: {
          reject: () => undefined,
          resolve: (value: string) => StartedResolved(value),
        },
        run: async () => "started",
      },
      label: "startAsync",
    } as never)

    await asyncDriver.flush()
    await asyncDriver.flush()

    await timerDriver.advanceBy(10)
    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(runActionCalls).toContain("StartedResolved")
    expect(runActionCalls).toContain("DebouncedResolved")
  })

  test("uses classifyAbort fallback and emits rejected monitor events", async () => {
    const Rejected = action("Rejected").withPayload<string>()
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const monitorEvents: RuntimeDebugEvent[] = []
    const runActionCalls: Array<string> = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: event => {
        monitorEvents.push(event)
      },
      getContext: () => ({}) as never,
      runAction: async actionToRun => {
        runActionCalls.push(actionToRun.type)
      },
      timerDriver,
    })

    const debounceHandler = module.effectHandlers.get("debounceAsync")

    debounceHandler?.({
      data: {
        asyncId: "reject-fallback",
        classifyAbort: () => undefined,
        delayMs: 0,
        handlers: {
          reject: (reason: unknown) => Rejected(String(reason)),
          resolve: () => undefined,
        },
        run: async () => {
          throw new Error("boom")
        },
      },
      label: "debounceAsync",
    } as never)

    await timerDriver.advanceBy(0)
    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(runActionCalls).toContain("Rejected")
    expect(
      monitorEvents.some(
        event =>
          event.type === "async-rejected" &&
          event.asyncId === "reject-fallback",
      ),
    ).toBe(true)
  })

  test("respects classifyAbort return value for debounced rejections", async () => {
    const Rejected = action("Rejected").withPayload<string>()
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runActionCalls: Array<string> = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: () => undefined,
      getContext: () => ({}) as never,
      runAction: async actionToRun => {
        runActionCalls.push(actionToRun.type)
      },
      timerDriver,
    })

    const debounceHandler = module.effectHandlers.get("debounceAsync")

    debounceHandler?.({
      data: {
        asyncId: "reject-classified",
        classifyAbort: () => true,
        delayMs: 0,
        handlers: {
          reject: () => Rejected("should-not-run"),
          resolve: () => undefined,
        },
        run: async () => {
          throw new Error("classified")
        },
      },
      label: "debounceAsync",
    } as never)

    await timerDriver.advanceBy(0)
    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(runActionCalls).toEqual([])
  })

  test("deduplicates cleanup cancellation events for shared async and debounce ids", () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const monitorEvents: RuntimeDebugEvent[] = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: event => {
        monitorEvents.push(event)
      },
      getContext: () => ({}) as never,
      runAction: async () => undefined,
      timerDriver,
    })

    const startHandler = module.effectHandlers.get("startAsync")
    const debounceHandler = module.effectHandlers.get("debounceAsync")

    debounceHandler?.({
      data: {
        asyncId: "same",
        delayMs: 25,
        handlers: {
          resolve: () => undefined,
        },
        run: async () => "debounced",
      },
      label: "debounceAsync",
    } as never)

    startHandler?.({
      data: {
        asyncId: "same",
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => new Promise<string>(() => undefined),
      },
      label: "startAsync",
    } as never)

    module.clear()

    const cleanupCancelled = monitorEvents.filter(
      event =>
        event.type === "async-cancelled" &&
        event.reason === "cleanup" &&
        event.asyncId === "same",
    )

    expect(cleanupCancelled).toHaveLength(1)
  })

  test("ignores stale debounce callbacks after timer cancellation", async () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createLeakyTimerDriver()
    const runActionCalls: Array<string> = []

    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: () => undefined,
      getContext: () => ({}) as never,
      runAction: async actionToRun => {
        runActionCalls.push(actionToRun.type)
      },
      timerDriver,
    })

    const debounceHandler = module.effectHandlers.get("debounceAsync")
    const cancelHandler = module.effectHandlers.get("cancelAsync")

    debounceHandler?.({
      data: {
        asyncId: "stale",
        delayMs: 100,
        handlers: {
          resolve: () => undefined,
        },
        run: async () => "never",
      },
      label: "debounceAsync",
    } as never)

    expect(
      cancelHandler?.({
        data: {
          asyncId: "stale",
        },
        label: "cancelAsync",
      } as never),
    ).toEqual(["AsyncCancelled"])

    await timerDriver.trigger(1)
    await asyncDriver.flush()

    expect(runActionCalls).toEqual([])
  })

  test("clearForTransition ignores undefined current state", () => {
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const module = createRuntimeAsyncModule({
      actionCommand: command => command.type,
      asyncDriver,
      emitMonitor: () => undefined,
      getContext: () => ({}) as never,
      runAction: async () => undefined,
      timerDriver,
    })

    module.clearForTransition({
      currentState: undefined,
      targetState: createState("Ready") as never,
    })

    expect(module.getDiagnostics()).toEqual([])
  })
})
