import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action"
import { createRuntimeResourceModule } from "../runtime/runtimeResourceModule"
import { createControlledTimerDriver } from "../runtime/timerDriver"
import { hasStateResource, setStateResource } from "../stateResources"

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

const flushTasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("runtime resource module", () => {
  test("ignores resource effects when no current state exists", () => {
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: undefined }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    expect(resourceHandler).toBeDefined()
    expect(
      resourceHandler?.({
        data: {
          key: "session",
          value: "abc",
        },
        label: "resource",
      } as never),
    ).toEqual([])
  })

  test("releases existing resources and emits release failure events", () => {
    const state = createState("Editing")
    const monitorEvents: Array<string> = []

    setStateResource({
      key: "session",
      state: state as never,
      teardown: () => {
        throw new Error("teardown failed")
      },
      value: "old",
    })

    const module = createRuntimeResourceModule({
      emitMonitor: event => {
        monitorEvents.push(event.type)
      },
      getContext: () => ({ currentState: state }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    expect(resourceHandler).toBeDefined()
    expect(
      resourceHandler?.({
        data: {
          key: "session",
          value: "new",
        },
        label: "resource",
      } as never),
    ).toEqual([])

    expect(monitorEvents).toContain("resource-released")
    expect(monitorEvents).toContain("resource-release-failed")
    expect(monitorEvents).toContain("resource-registered")
  })

  test("supports latest bridge pacing and dispatches only the latest event", async () => {
    const state = createState("Loading")
    const timerDriver = createControlledTimerDriver()
    const applyEvent = action("ApplyEvent").withPayload<string>()
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver,
    })

    const resourceHandler = module.effectHandlers.get("resource")

    expect(resourceHandler).toBeDefined()

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: () => undefined,
            resolve: (event: string) => applyEvent(event),
          },
          pace: "latest",
          subscribe: (_value: unknown, onEvent: (event: string) => void) => {
            onEvent("a")
            onEvent("b")

            return () => undefined
          },
        },
        key: "stream",
        value: {},
      },
      label: "resource",
    } as never)

    await timerDriver.advanceBy(0)
    await flushTasks()

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenCalledWith(applyEvent("b"))
  })

  test("handles subscription effects as resources", () => {
    const state = createState("Subscribed")
    const teardown = jest.fn()
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    const subscriptionHandler = module.effectHandlers.get("subscription")

    expect(subscriptionHandler).toBeDefined()
    expect(
      subscriptionHandler?.({
        data: {
          key: "sub",
          subscribe: () => teardown,
        },
        label: "subscription",
      } as never),
    ).toEqual([])

    expect(hasStateResource(state as never, "sub")).toBeTruthy()

    module.clear()

    expect(teardown).toHaveBeenCalled()
    expect(hasStateResource(state as never, "sub")).toBeFalsy()
  })

  test("transfers resources on same-state updates and clears on transitions", () => {
    const currentState = createState("Editing", "append")
    const updatedState = createState("Editing", "update")
    const nextState = createState("Review", "append")
    const teardown = jest.fn()

    setStateResource({
      key: "session",
      state: currentState as never,
      teardown,
      value: "abc",
    })

    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    module.clearForTransition({
      currentState: currentState as never,
      targetState: updatedState as never,
    })

    expect(hasStateResource(currentState as never, "session")).toBeFalsy()
    expect(hasStateResource(updatedState as never, "session")).toBeTruthy()

    module.clearForTransition({
      currentState: updatedState as never,
      targetState: nextState as never,
    })

    expect(hasStateResource(updatedState as never, "session")).toBeFalsy()
    expect(teardown).toHaveBeenCalled()
  })
})
