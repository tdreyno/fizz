import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action"
import type { RuntimeBrowserDriver } from "../browser/runtimeBrowserDriver"
import { createRuntimeBrowserModule } from "../browser/runtimeBrowserModule"
import { createControlledTimerDriver } from "../runtime/timerDriver"
import { disposeStateResources, setStateResource } from "../stateResources"

type RuntimeStateStub = {
  data: unknown
  executor: () => Array<unknown>
  isNamed: () => boolean
  isStateTransition: true
  mode: "append" | "update"
  name: string
  state: never
}

const createState = (
  name: string,
  mode: "append" | "update" = "append",
): RuntimeStateStub => ({
  data: {},
  executor: () => [],
  isNamed: () => true,
  isStateTransition: true,
  mode,
  name,
  state: (() => {
    throw new Error("state should not run")
  }) as never,
})

const createMockEventTarget = () => {
  const listeners = new Map<string, EventListener>()

  return {
    target: {
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }),
      removeEventListener: jest.fn((type: string) => {
        listeners.delete(type)
      }),
    } as unknown as EventTarget,
    fire: (type: string, event: Event) => {
      listeners.get(type)?.(event)
    },
  }
}

const createMockEvent = (type = "pointermove") =>
  new Event(type) as PointerEvent

const createPointerEventWithX = (x: number) =>
  ({
    clientX: x,
    type: "pointermove",
  }) as PointerEvent

const Move = action("Move").withPayload<{ x: number }>()

const createDomDriver = (): RuntimeBrowserDriver => ({
  addEventListener: (target, type, listener, options) =>
    target.addEventListener(type, listener, options),
  removeEventListener: (target, type, listener, options) =>
    target.removeEventListener(type, listener, options),
})

describe("runtime browser module — domListen coalescing", () => {
  test("domListen returns no-op when there is no current state", () => {
    const timerDriver = createControlledTimerDriver()
    const runAction = jest.fn(async () => undefined)

    const module = createRuntimeBrowserModule({
      browserDriver: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as never,
      getCurrentState: () => undefined,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    expect(
      listenHandler({
        data: {
          targetResourceId: "missing",
          toAction: () => Move({ x: 1 }),
          type: "pointermove",
        },
        label: "domListen",
      } as never),
    ).toEqual([])
    expect(runAction).not.toHaveBeenCalled()
  })

  test("domListen throws when target resource is not an EventTarget", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")

    setStateResource({ key: "el", state: state as never, value: {} })

    const module = createRuntimeBrowserModule({
      browserDriver: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as never,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    expect(() =>
      listenHandler({
        data: {
          targetResourceId: "el",
          toAction: () => Move({ x: 1 }),
          type: "pointermove",
        },
        label: "domListen",
      } as never),
    ).toThrow(
      "Resource `el` is not an EventTarget and cannot be used with listen().",
    )
  })

  test("no coalesce: dispatches every event immediately", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")
    expect(listenHandler).toBeDefined()

    listenHandler!({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(3)
  })

  test("coalesce: animation-frame: fires only latest event per frame", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")
    expect(listenHandler).toBeDefined()

    listenHandler!({
      data: {
        coalesce: "animation-frame",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())

    // No actions dispatched yet — waiting for frame
    expect(runAction).toHaveBeenCalledTimes(0)

    // Advance one frame
    await timerDriver.advanceFrames(1)

    // Only one action dispatched
    expect(runAction).toHaveBeenCalledTimes(1)
  })

  test("coalesce: animation-frame: fires again on next frame if new events arrive", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        coalesce: "animation-frame",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    // First batch
    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())
    await timerDriver.advanceFrames(1)

    expect(runAction).toHaveBeenCalledTimes(1)

    // Second batch after frame
    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(1)

    await timerDriver.advanceFrames(1)

    expect(runAction).toHaveBeenCalledTimes(2)
  })

  test("coalesce: animation-frame: keeps only latest event while prior action is unresolved", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    let resolveFirstAction: (() => void) | undefined
    const runAction = jest.fn(() => {
      if (resolveFirstAction) {
        return Promise.resolve()
      }

      return new Promise<void>(resolve => {
        resolveFirstAction = resolve
      })
    })
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        coalesce: "animation-frame",
        targetResourceId: "el",
        toAction: (event: PointerEvent) => Move({ x: event.clientX }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createPointerEventWithX(1))
    fire("pointermove", createPointerEventWithX(2))
    fire("pointermove", createPointerEventWithX(3))

    const firstFrame = timerDriver.advanceFrames(1)
    await Promise.resolve()

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenLastCalledWith(Move({ x: 3 }))

    fire("pointermove", createPointerEventWithX(4))
    fire("pointermove", createPointerEventWithX(5))
    fire("pointermove", createPointerEventWithX(6))

    expect(runAction).toHaveBeenCalledTimes(1)

    resolveFirstAction?.()
    await firstFrame
    await Promise.resolve()
    await timerDriver.advanceFrames(1)

    expect(runAction).toHaveBeenCalledTimes(2)
    expect(runAction).toHaveBeenLastCalledWith(Move({ x: 6 }))
  })

  test("coalesce: animation-frame: teardown cancels pending frame", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        coalesce: "animation-frame",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    // Tear down before the frame fires — dispose state resources directly (matches real runtime path)
    disposeStateResources(state as never)

    // Frame fires after teardown — should NOT dispatch
    await timerDriver.advanceFrames(1)

    expect(runAction).toHaveBeenCalledTimes(0)
  })

  test("coalesce: microtask: fires only latest event before next microtask", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        coalesce: "microtask",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())

    // No dispatch yet
    expect(runAction).toHaveBeenCalledTimes(0)

    // Advance 0ms timer (microtask-boundary in controlled driver)
    await timerDriver.advanceBy(0)

    expect(runAction).toHaveBeenCalledTimes(1)
  })

  test("default order remains registration-stable", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 2 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(2)
    expect(runAction.mock.calls).toEqual([[Move({ x: 1 })], [Move({ x: 2 })]])
  })

  test("before/default/after listener ordering is deterministic", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        order: "after-default",
        targetResourceId: "el",
        toAction: () => Move({ x: 3 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 2 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    listenHandler({
      data: {
        order: "before-default",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(3)
    expect(runAction.mock.calls).toEqual([
      [Move({ x: 1 })],
      [Move({ x: 2 })],
      [Move({ x: 3 })],
    ])
  })

  test("when last handler is removed, native listener is removed once", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 2 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    disposeStateResources(state as never)

    expect((target.removeEventListener as jest.Mock).mock.calls.length).toBe(1)
  })

  test("coalesced before-default action may run after default action", async () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    const listenHandler = module.effectHandlers.get("domListen")!

    listenHandler({
      data: {
        coalesce: "animation-frame",
        order: "before-default",
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    listenHandler({
      data: {
        targetResourceId: "el",
        toAction: () => Move({ x: 2 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenNthCalledWith(1, Move({ x: 2 }))

    await timerDriver.advanceFrames(1)

    expect(runAction).toHaveBeenCalledTimes(2)
    expect(runAction).toHaveBeenNthCalledWith(2, Move({ x: 1 }))
  })
})
