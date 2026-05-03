import { describe, expect, jest, test } from "@jest/globals"

import { createRuntimeDomModule } from "../browser/runtimeDomModule"
import {
  disposeStateResources,
  getStateResources,
  setStateResource,
} from "../stateResources"

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

describe("runtimeDomModule", () => {
  test("domAcquire returns empty when current state is unavailable", () => {
    const module = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => undefined,
      runAction: async () => undefined,
    })

    const acquire = module.effectHandlers.get("domAcquire")

    expect(acquire).toBeDefined()
    expect(
      acquire!({
        data: {
          kind: "singleton",
          resourceId: "body",
          target: "body",
        },
        label: "domAcquire",
      } as never),
    ).toEqual([])
  })

  test("domAcquire resolves singleton and query resources", () => {
    const state = createState("Ready")
    const body = { id: "body" }
    const scopedElement = {
      querySelector: (selector: string) => ({ selector }),
    }

    const module = createRuntimeDomModule({
      browserDriver: {
        body: () => body as never,
        querySelector: (selector: string) => ({ found: selector }) as never,
      },
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })

    const acquire = module.effectHandlers.get("domAcquire")!

    acquire({
      data: {
        kind: "singleton",
        resourceId: "body",
        target: "body",
      },
      label: "domAcquire",
    } as never)

    setStateResource({
      key: "scope",
      state: state as never,
      value: scopedElement,
    })

    acquire({
      data: {
        args: [".item"],
        kind: "query",
        method: "querySelector",
        resourceId: "item",
        scopeResourceId: "scope",
      },
      label: "domAcquire",
    } as never)

    const resources = getStateResources(state as never)

    expect(resources.body).toBe(body)
    expect(resources.item).toEqual({ found: ".item" })
  })

  test("domAcquire supports all singleton targets and external resources", () => {
    const state = createState("Ready")
    const driver = {
      activeElement: jest.fn(() => ({ id: "active" })),
      body: jest.fn(() => ({ id: "body" })),
      document: jest.fn(() => ({ id: "document" })),
      documentElement: jest.fn(() => ({ id: "documentElement" })),
      history: jest.fn(() => ({ id: "history" })),
      location: jest.fn(() => ({ id: "location" })),
      visualViewport: jest.fn(() => ({ id: "visualViewport" })),
      window: jest.fn(() => ({ id: "window" })),
    }

    const module = createRuntimeDomModule({
      browserDriver: driver,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })
    const acquire = module.effectHandlers.get("domAcquire")!

    const singletonTargets = [
      "window",
      "document",
      "body",
      "documentElement",
      "activeElement",
      "history",
      "location",
      "visualViewport",
    ] as const

    singletonTargets.forEach(target => {
      acquire({
        data: {
          kind: "singleton",
          resourceId: `singleton:${target}`,
          target,
        },
        label: "domAcquire",
      } as never)
    })

    acquire({
      data: {
        element: { id: "external" },
        kind: "external",
        resourceId: "external",
      },
      label: "domAcquire",
    } as never)

    const resources = getStateResources(state as never)
    expect(driver.window).toHaveBeenCalled()
    expect(driver.document).toHaveBeenCalled()
    expect(driver.body).toHaveBeenCalled()
    expect(driver.documentElement).toHaveBeenCalled()
    expect(driver.activeElement).toHaveBeenCalled()
    expect(driver.history).toHaveBeenCalled()
    expect(driver.location).toHaveBeenCalled()
    expect(driver.visualViewport).toHaveBeenCalled()
    expect(resources.external).toEqual({ id: "external" })
  })

  test("domAcquire query supports all methods and validates closest scope", () => {
    const state = createState("Ready")
    const scopeElement = { nodeType: 1 } as unknown as Element
    const queryScope = {
      querySelector: jest.fn(),
    }
    const driver = {
      closest: jest.fn(() => ({ id: "closest" })),
      getElementById: jest.fn(() => ({ id: "by-id" })),
      getElementsByClassName: jest.fn(() => ["class"]),
      getElementsByName: jest.fn(() => ["name"]),
      getElementsByTagName: jest.fn(() => ["tag"]),
      querySelector: jest.fn(() => ({ id: "query" })),
      querySelectorAll: jest.fn(() => ["all"]),
    }

    setStateResource({ key: "scope", state: state as never, value: queryScope })
    setStateResource({
      key: "element",
      state: state as never,
      value: scopeElement,
    })
    setStateResource({
      key: "bad-scope",
      state: state as never,
      value: { id: "bad" },
    })

    const module = createRuntimeDomModule({
      browserDriver: driver,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })
    const acquire = module.effectHandlers.get("domAcquire")!

    acquire({
      data: {
        args: ["profile"],
        kind: "query",
        method: "getElementById",
        resourceId: "id",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: ["item"],
        kind: "query",
        method: "getElementsByClassName",
        resourceId: "class",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: ["name"],
        kind: "query",
        method: "getElementsByName",
        resourceId: "name",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: ["div"],
        kind: "query",
        method: "getElementsByTagName",
        resourceId: "tag",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [".item"],
        kind: "query",
        method: "querySelector",
        resourceId: "single",
        scopeResourceId: "scope",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [".item"],
        kind: "query",
        method: "querySelectorAll",
        resourceId: "all",
        scopeResourceId: "scope",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [".closest"],
        kind: "query",
        method: "closest",
        resourceId: "closest",
        scopeResourceId: "element",
      },
      label: "domAcquire",
    } as never)

    expect(() =>
      acquire({
        data: {
          args: [".x"],
          kind: "query",
          method: "querySelector",
          resourceId: "invalid",
          scopeResourceId: "bad-scope",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("cannot be used as a DOM query scope")

    expect(() =>
      acquire({
        data: {
          args: [".x"],
          kind: "query",
          method: "closest",
          resourceId: "invalid-closest",
          scopeResourceId: "scope",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("must resolve to an Element to use closest")

    expect(driver.getElementById).toHaveBeenCalledWith("profile", undefined)
    expect(driver.getElementsByClassName).toHaveBeenCalledWith(
      "item",
      undefined,
    )
    expect(driver.getElementsByName).toHaveBeenCalledWith("name", undefined)
    expect(driver.getElementsByTagName).toHaveBeenCalledWith("div", undefined)
    expect(driver.querySelector).toHaveBeenCalledWith(".item", queryScope)
    expect(driver.querySelectorAll).toHaveBeenCalledWith(".item", queryScope)
    expect(driver.closest).toHaveBeenCalledWith(scopeElement, ".closest")
  })

  test("domAcquire throws when required singleton or query driver methods are missing", () => {
    const state = createState("Ready")
    const module = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })
    const acquire = module.effectHandlers.get("domAcquire")!

    expect(() =>
      acquire({
        data: {
          kind: "singleton",
          resourceId: "viewport",
          target: "visualViewport",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("missing `visualViewport`")

    expect(() =>
      acquire({
        data: {
          args: [".item"],
          kind: "query",
          method: "querySelector",
          resourceId: "item",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("missing `querySelector`")
  })

  test("domListen registers and tears down listeners", () => {
    const state = createState("Ready")
    const addEventListener = jest.fn()
    const removeEventListener = jest.fn()
    const target = {
      addEventListener,
      removeEventListener,
    } as unknown as EventTarget

    setStateResource({ key: "target", state: state as never, value: target })

    const module = createRuntimeDomModule({
      browserDriver: {
        addEventListener: (node, type, listener, options) =>
          node.addEventListener(type, listener, options),
        removeEventListener: (node, type, listener, options) =>
          node.removeEventListener(type, listener, options),
      },
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })

    const listen = module.effectHandlers.get("domListen")!

    listen({
      data: {
        targetResourceId: "target",
        toAction: () => ({ payload: undefined, type: "Tick" }),
        type: "click",
      },
      label: "domListen",
    } as never)

    expect(addEventListener).toHaveBeenCalledTimes(1)

    disposeStateResources(state as never)

    expect(removeEventListener).toHaveBeenCalledTimes(1)
  })

  test("domListen validates target and requires listener driver methods", () => {
    const state = createState("Ready")

    setStateResource({ key: "not-target", state: state as never, value: {} })

    const module = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })
    const listen = module.effectHandlers.get("domListen")!

    expect(() =>
      listen({
        data: {
          targetResourceId: "not-target",
          toAction: () => ({ payload: undefined, type: "Tick" }),
          type: "click",
        },
        label: "domListen",
      } as never),
    ).toThrow("is not an EventTarget")

    const eventTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as EventTarget
    setStateResource({
      key: "target",
      state: state as never,
      value: eventTarget,
    })

    expect(() =>
      listen({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Tick" }),
          type: "click",
        },
        label: "domListen",
      } as never),
    ).toThrow("missing `addEventListener`")
  })

  test("domListen callback dispatches action and no-ops when state is missing", async () => {
    const state = createState("Ready")
    const runAction = jest.fn(async () => undefined)
    const addEventListener = jest.fn()
    const removeEventListener = jest.fn()
    const target = {
      addEventListener,
      removeEventListener,
    } as unknown as EventTarget
    setStateResource({ key: "target", state: state as never, value: target })

    const module = createRuntimeDomModule({
      browserDriver: {
        addEventListener: (node, type, listener, options) =>
          node.addEventListener(type, listener, options),
        removeEventListener: (node, type, listener, options) =>
          node.removeEventListener(type, listener, options),
      },
      getCurrentState: () => state as never,
      runAction,
    })
    const listen = module.effectHandlers.get("domListen")!

    expect(
      createRuntimeDomModule({
        browserDriver: {},
        getCurrentState: () => undefined,
        runAction,
      }).effectHandlers.get("domListen")!({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Skipped" }),
          type: "click",
        },
        label: "domListen",
      } as never),
    ).toEqual([])

    listen({
      data: {
        targetResourceId: "target",
        toAction: () => ({ payload: undefined, type: "Tick" }),
        type: "click",
      },
      label: "domListen",
    } as never)

    const callback = addEventListener.mock.calls[0]?.[1] as
      | EventListener
      | undefined
    callback?.(new Event("click"))
    await Promise.resolve()

    expect(runAction).toHaveBeenCalledWith({ payload: undefined, type: "Tick" })
  })

  test("observer handlers validate targets and support custom observer id", () => {
    const state = createState("Ready")
    const target = { nodeType: 1 } as Element
    const observeIntersection = jest.fn()
    const observeResize = jest.fn()
    const disconnectIntersection = jest.fn()
    const disconnectResize = jest.fn()

    setStateResource({ key: "target", state: state as never, value: target })

    const module = createRuntimeDomModule({
      browserDriver: {
        createIntersectionObserver: callback => {
          callback([], {
            disconnect: disconnectIntersection,
            observe: observeIntersection,
          } as never)

          return {
            disconnect: disconnectIntersection,
            observe: observeIntersection,
          } as never
        },
        createResizeObserver: callback => {
          callback([], {
            disconnect: disconnectResize,
            observe: observeResize,
          } as never)

          return {
            disconnect: disconnectResize,
            observe: observeResize,
          } as never
        },
      },
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })

    const observeIntersectionHandler = module.effectHandlers.get(
      "domObserveIntersection",
    )!
    const observeResizeHandler = module.effectHandlers.get("domObserveResize")!

    observeIntersectionHandler({
      data: {
        observerId: "intersection:fixed",
        targetResourceId: "target",
        toAction: () => ({ payload: undefined, type: "Observed" }),
      },
      label: "domObserveIntersection",
    } as never)

    observeResizeHandler({
      data: {
        observerId: "resize:fixed",
        targetResourceId: "target",
        toAction: () => ({ payload: undefined, type: "Resized" }),
      },
      label: "domObserveResize",
    } as never)

    expect(observeIntersection).toHaveBeenCalledWith(target)
    expect(observeResize).toHaveBeenCalledWith(target, undefined)

    const resources = getStateResources(state as never)
    expect(resources["intersection:fixed"]).toBeDefined()
    expect(resources["resize:fixed"]).toBeDefined()

    disposeStateResources(state as never)

    expect(disconnectIntersection).toHaveBeenCalled()
    expect(disconnectResize).toHaveBeenCalled()
  })

  test("observer handlers throw when resource is not an element", () => {
    const state = createState("Ready")

    setStateResource({ key: "target", state: state as never, value: {} })

    const module = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })

    const observeIntersectionHandler = module.effectHandlers.get(
      "domObserveIntersection",
    )!
    const observeResizeHandler = module.effectHandlers.get("domObserveResize")!

    expect(() =>
      observeIntersectionHandler({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Observed" }),
        },
        label: "domObserveIntersection",
      } as never),
    ).toThrow("is not an Element")

    expect(() =>
      observeResizeHandler({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Resized" }),
        },
        label: "domObserveResize",
      } as never),
    ).toThrow("is not an Element")
  })

  test("observer handlers no-op without state and throw when observer drivers are missing", () => {
    const noState = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => undefined,
      runAction: async () => undefined,
    })

    expect(
      noState.effectHandlers.get("domObserveIntersection")!({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Observed" }),
        },
        label: "domObserveIntersection",
      } as never),
    ).toEqual([])

    expect(
      noState.effectHandlers.get("domObserveResize")!({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Resized" }),
        },
        label: "domObserveResize",
      } as never),
    ).toEqual([])

    const state = createState("Ready")
    setStateResource({
      key: "target",
      state: state as never,
      value: { nodeType: 1 } as unknown as Element,
    })

    const missingDrivers = createRuntimeDomModule({
      browserDriver: {},
      getCurrentState: () => state as never,
      runAction: async () => undefined,
    })

    expect(() =>
      missingDrivers.effectHandlers.get("domObserveIntersection")!({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Observed" }),
        },
        label: "domObserveIntersection",
      } as never),
    ).toThrow("missing `createIntersectionObserver`")

    expect(() =>
      missingDrivers.effectHandlers.get("domObserveResize")!({
        data: {
          targetResourceId: "target",
          toAction: () => ({ payload: undefined, type: "Resized" }),
        },
        label: "domObserveResize",
      } as never),
    ).toThrow("missing `createResizeObserver`")
  })
})
