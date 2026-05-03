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

  test("uses onDidChange bridge discovery and ignores filtered events", async () => {
    const state = createState("Watching")
    const runAction = jest.fn(async () => undefined)
    const applyEvent = action("ApplyEvent").withPayload<string>()
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    expect(resourceHandler).toBeDefined()

    resourceHandler?.({
      data: {
        bridge: {
          filter: (event: string) => event !== "drop",
          handlers: {
            reject: () => undefined,
            resolve: (event: string) => applyEvent(event),
          },
        },
        key: "events",
        value: {
          onDidChange: (onEvent: (event: string) => void) => {
            onEvent("drop")
            onEvent("keep")

            return () => undefined
          },
        },
      },
      label: "resource",
    } as never)

    await flushTasks()

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenCalledWith(applyEvent("keep"))
  })

  test("does not run mapped actions when bridge resolve returns undefined", async () => {
    const state = createState("Watching")
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: () => undefined,
            resolve: () => undefined,
          },
          subscribe: (_value: unknown, onEvent: (event: string) => void) => {
            onEvent("ignored")
            return () => undefined
          },
        },
        key: "events",
        value: {},
      },
      label: "resource",
    } as never)

    await flushTasks()

    expect(runAction).not.toHaveBeenCalled()
  })

  test("skips bridge subscription when value is not subscribable", async () => {
    const state = createState("Watching")
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: () => undefined,
            resolve: () => undefined,
          },
        },
        key: "events",
        value: 123,
      },
      label: "resource",
    } as never)

    await flushTasks()

    expect(runAction).not.toHaveBeenCalled()
    expect(hasStateResource(state as never, "events")).toBeTruthy()
  })

  test("runs reject mapping when subscribe throws", async () => {
    const state = createState("Watching")
    const runAction = jest.fn(async () => undefined)
    const rejected = action("Rejected").withPayload<string>()
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: (error: unknown) => rejected(String(error)),
            resolve: () => undefined,
          },
          subscribe: () => {
            throw new Error("subscribe failed")
          },
        },
        key: "events",
        value: {},
      },
      label: "resource",
    } as never)

    await flushTasks()

    expect(runAction).toHaveBeenCalledWith(rejected("Error: subscribe failed"))
  })

  test("does not dispatch bridge events after resource clear", async () => {
    const state = createState("Watching")
    const timerDriver = createControlledTimerDriver()
    const runAction = jest.fn(async () => undefined)
    const applyEvent = action("ApplyEvent").withPayload<string>()
    let emitEvent: ((event: string) => void) | undefined

    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver,
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: () => undefined,
            resolve: (event: string) => applyEvent(event),
          },
          pace: "latest",
          subscribe: (_value: unknown, onEvent: (event: string) => void) => {
            emitEvent = onEvent
            return () => undefined
          },
        },
        key: "events",
        value: {},
      },
      label: "resource",
    } as never)

    emitEvent?.("before-clear")
    module.clear()

    await timerDriver.advanceBy(0)
    await flushTasks()

    emitEvent?.("after-clear")
    await timerDriver.advanceBy(0)
    await flushTasks()

    expect(runAction).not.toHaveBeenCalledWith(applyEvent("after-clear"))
  })

  test("cancels pending debounce bridge dispatches on clear", async () => {
    const state = createState("Watching")
    const timerDriver = createControlledTimerDriver()
    const runAction = jest.fn(async () => undefined)
    const applyEvent = action("ApplyEvent").withPayload<string>()
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction,
      timerDriver,
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        bridge: {
          handlers: {
            reject: () => undefined,
            resolve: (event: string) => applyEvent(event),
          },
          pace: {
            debounceMs: 25,
          },
          subscribe: (_value: unknown, onEvent: (event: string) => void) => {
            onEvent("a")
            return () => undefined
          },
        },
        key: "events",
        value: {},
      },
      label: "resource",
    } as never)

    module.clear()
    await timerDriver.advanceBy(25)
    await flushTasks()

    expect(runAction).not.toHaveBeenCalledWith(applyEvent("a"))
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

  test("clearForTransition returns when current state is undefined", () => {
    const targetState = createState("Review", "append")
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: undefined }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    module.clearForTransition({
      currentState: undefined,
      targetState: targetState as never,
    })

    expect(true).toBeTruthy()
  })

  test("clear and clearForGoBack are no-ops when there is no current state", () => {
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: undefined }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    module.clear()
    module.clearForGoBack()

    expect(true).toBeTruthy()
  })

  test("clear emits release failure when cleanup teardown throws", () => {
    const state = createState("Editing")
    const events: Array<string> = []

    setStateResource({
      key: "session",
      state: state as never,
      teardown: () => {
        throw new Error("cleanup failed")
      },
      value: "abc",
    })

    const module = createRuntimeResourceModule({
      emitMonitor: event => events.push(event.type),
      getContext: () => ({ currentState: state }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    module.clear()

    expect(events).toContain("resource-released")
    expect(events).toContain("resource-release-failed")
  })

  test("releasing existing resource emits only release event when teardown succeeds", () => {
    const state = createState("Editing")
    const eventTypes: Array<string> = []

    setStateResource({
      key: "session",
      state: state as never,
      teardown: () => undefined,
      value: "old",
    })

    const module = createRuntimeResourceModule({
      emitMonitor: event => {
        eventTypes.push(event.type)
      },
      getContext: () => ({ currentState: state }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        key: "session",
        value: "new",
      },
      label: "resource",
    } as never)

    expect(eventTypes).toContain("resource-released")
    expect(eventTypes).toContain("resource-registered")
    expect(eventTypes).not.toContain("resource-release-failed")
  })

  test("skips release monitor emission when context state name is missing", () => {
    const state = createState("Editing")
    const emitMonitor = jest.fn()
    let getContextCalls = 0

    setStateResource({
      key: "session",
      state: state as never,
      teardown: () => undefined,
      value: "old",
    })

    const module = createRuntimeResourceModule({
      emitMonitor,
      getContext: () => {
        if (getContextCalls === 0) {
          getContextCalls += 1
          return {
            currentState: state,
          } as never
        }

        return {
          currentState: undefined,
        } as never
      },
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    const resourceHandler = module.effectHandlers.get("resource")

    resourceHandler?.({
      data: {
        key: "session",
        value: "new",
      },
      label: "resource",
    } as never)

    expect(emitMonitor).toHaveBeenCalledWith({
      resourceKey: "session",
      stateName: "Editing",
      type: "resource-registered",
    })
    expect(emitMonitor).toHaveBeenCalledTimes(1)
  })

  test("getDiagnostics returns empty when there is no current state", () => {
    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: undefined }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    expect(module.getDiagnostics()).toEqual([])
  })

  test("getDiagnostics returns active resource keys for current state", () => {
    const state = createState("Editing")

    setStateResource({ key: "session", state: state as never, value: "abc" })
    setStateResource({ key: "editor", state: state as never, value: { id: 1 } })

    const module = createRuntimeResourceModule({
      emitMonitor: () => undefined,
      getContext: () => ({ currentState: state }) as never,
      runAction: async () => undefined,
      timerDriver: createControlledTimerDriver(),
    })

    expect(module.getDiagnostics()).toEqual(
      expect.arrayContaining([
        { key: "editor", stateName: "Editing" },
        { key: "session", stateName: "Editing" },
      ]),
    )
  })
})
