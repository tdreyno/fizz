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
})
