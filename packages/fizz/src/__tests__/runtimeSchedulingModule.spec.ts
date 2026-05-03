import { describe, expect, jest, test } from "@jest/globals"

import { createRuntimeSchedulingModule } from "../runtime/runtimeSchedulingModule.js"
import type { RuntimeTimerDriver } from "../runtime/timerDriver.js"
import { createControlledTimerDriver } from "../runtime/timerDriver.js"

type StoredFrame = {
  onFrame: (timestamp: number) => Promise<void> | void
}

type StoredTimer = {
  onElapsed: () => Promise<void> | void
}

const createLeakyTimerDriver = (): RuntimeTimerDriver & {
  triggerFrame: (handle: number, timestamp: number) => Promise<void>
  triggerInterval: (handle: number) => Promise<void>
} => {
  let nextHandle = 1
  const frames = new Map<number, StoredFrame>()
  const intervals = new Map<number, StoredTimer>()

  return {
    cancel: () => {
      // Intentionally keep callbacks reachable so stale callback branches can be exercised.
    },
    start: () => nextHandle++,
    startFrame: onFrame => {
      const handle = nextHandle++

      frames.set(handle, { onFrame })

      return handle
    },
    startInterval: (_delay, onElapsed) => {
      const handle = nextHandle++

      intervals.set(handle, { onElapsed })

      return handle
    },
    triggerFrame: async (handle, timestamp) => {
      const stored = frames.get(handle)

      if (!stored) {
        return
      }

      await stored.onFrame(timestamp)
    },
    triggerInterval: async handle => {
      const stored = intervals.get(handle)

      if (!stored) {
        return
      }

      await stored.onElapsed()
    },
  }
}

describe("runtimeSchedulingModule", () => {
  test("restarting an interval emits restart cancellation and diagnostics include interval entries", () => {
    const timerDriver = createControlledTimerDriver()
    const monitorEvents: Array<Record<string, unknown>> = []
    const module = createRuntimeSchedulingModule({
      actionCommand: action => action.type,
      emitMonitor: event => {
        monitorEvents.push(event as never)
      },
      runAction: async () => undefined,
      timerDriver,
    })

    const startInterval = module.effectHandlers.get("startInterval")

    expect(startInterval).toBeDefined()

    const first = startInterval?.({
      data: {
        delay: 10,
        intervalId: "poll",
      },
      label: "startInterval",
    } as never)

    expect(first).toEqual([expect.any(String)])

    startInterval?.({
      data: {
        delay: 20,
        intervalId: "poll",
      },
      label: "startInterval",
    } as never)

    expect(monitorEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          delay: 10,
          intervalId: "poll",
          reason: "restart",
          type: "interval-cancelled",
        }),
      ]),
    )

    expect(module.getDiagnostics()).toEqual(
      expect.arrayContaining([
        {
          id: "poll",
          kind: "interval",
        },
      ]),
    )
  })

  test("ignores stale interval and frame callbacks after replacement", async () => {
    const timerDriver = createLeakyTimerDriver()
    const runAction = jest.fn(async () => undefined)
    const monitorEvents: Array<Record<string, unknown>> = []
    const module = createRuntimeSchedulingModule({
      actionCommand: action => action.type,
      emitMonitor: event => {
        monitorEvents.push(event as never)
      },
      runAction,
      timerDriver,
    })

    module.effectHandlers.get("startInterval")?.({
      data: {
        delay: 5,
        intervalId: "poll",
      },
      label: "startInterval",
    } as never)

    module.effectHandlers.get("restartInterval")?.({
      data: {
        delay: 5,
        intervalId: "poll",
      },
      label: "restartInterval",
    } as never)

    await timerDriver.triggerInterval(1)

    expect(runAction).not.toHaveBeenCalled()
    expect(monitorEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          intervalId: "poll",
          type: "interval-triggered",
        }),
      ]),
    )

    module.effectHandlers.get("startFrame")?.({
      data: { loop: false },
      label: "startFrame",
    } as never)

    module.effectHandlers.get("startFrame")?.({
      data: { loop: false },
      label: "startFrame",
    } as never)

    await timerDriver.triggerFrame(3, 16)

    expect(runAction).not.toHaveBeenCalled()
    expect(monitorEvents).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          timestamp: 16,
          type: "frame-triggered",
        }),
      ]),
    )
  })
})
