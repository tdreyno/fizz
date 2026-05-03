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
  test("confirm/prompt handle rejected promises and null prompt values", async () => {
    const timerDriver = createControlledTimerDriver()
    const runAction = jest.fn(async () => undefined)

    const rejectConfirm = createRuntimeBrowserModule({
      browserDriver: {
        confirm: () => Promise.reject(new Error("boom")),
      } as never,
      getCurrentState: () => undefined,
      runAction,
      timerDriver,
    })
    const nullPrompt = createRuntimeBrowserModule({
      browserDriver: {
        prompt: () => Promise.resolve(null),
      } as never,
      getCurrentState: () => undefined,
      runAction,
      timerDriver,
    })
    const rejectPrompt = createRuntimeBrowserModule({
      browserDriver: {
        prompt: () => Promise.reject(new Error("boom")),
      } as never,
      getCurrentState: () => undefined,
      runAction,
      timerDriver,
    })

    rejectConfirm.effectHandlers.get("confirm")!({
      data: { message: "Proceed?" },
      label: "confirm",
    } as never)
    nullPrompt.effectHandlers.get("prompt")!({
      data: { message: "Name?" },
      label: "prompt",
    } as never)
    rejectPrompt.effectHandlers.get("prompt")!({
      data: { message: "Name?" },
      label: "prompt",
    } as never)

    await Promise.resolve()
    await Promise.resolve()

    expect(runAction).toHaveBeenCalledWith({
      payload: undefined,
      type: "ConfirmRejected",
    })
    expect(runAction).toHaveBeenCalledWith({
      payload: undefined,
      type: "PromptCancelled",
    })
  })

  test("throws when one-way handlers are used without required driver methods", () => {
    const timerDriver = createControlledTimerDriver()
    const module = createRuntimeBrowserModule({
      browserDriver: {
        alert: jest.fn(),
      } as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })

    expect(() =>
      module.effectHandlers.get("copyToClipboard")!({
        data: { text: "copy" },
        label: "copyToClipboard",
      } as never),
    ).toThrow("missing `copyToClipboard`")

    expect(() =>
      module.effectHandlers.get("locationSetSearch")!({
        data: { search: "?q=1" },
        label: "locationSetSearch",
      } as never),
    ).toThrow("missing `locationSetSearch`")
  })

  test("clear cancels pending confirm and prompt", async () => {
    const timerDriver = createControlledTimerDriver()
    const runAction = jest.fn(async () => undefined)
    let resolveConfirm: ((value: "accept" | "reject") => void) | undefined
    let resolvePrompt: ((value: string | null) => void) | undefined
    const confirmPending = new Promise<"accept" | "reject">(resolve => {
      resolveConfirm = resolve
    })
    const promptPending = new Promise<string | null>(resolve => {
      resolvePrompt = resolve
    })

    const module = createRuntimeBrowserModule({
      browserDriver: {
        confirm: () => confirmPending,
        prompt: () => promptPending,
      } as never,
      getCurrentState: () => undefined,
      runAction,
      timerDriver,
    })

    const confirmHandler = module.effectHandlers.get("confirm")!
    const promptHandler = module.effectHandlers.get("prompt")!

    confirmHandler({ data: { message: "Proceed?" }, label: "confirm" } as never)
    promptHandler({ data: { message: "Name?" }, label: "prompt" } as never)

    module.clear()

    await Promise.resolve()
    await Promise.resolve()

    expect(runAction).toHaveBeenCalledWith({
      payload: undefined,
      type: "ConfirmRejected",
    })
    expect(runAction).toHaveBeenCalledWith({
      payload: undefined,
      type: "PromptCancelled",
    })

    resolveConfirm?.("accept")
    resolvePrompt?.("Ada")
  })

  test("throws when confirm or prompt are requested while pending", () => {
    const timerDriver = createControlledTimerDriver()
    const module = createRuntimeBrowserModule({
      browserDriver: {
        confirm: () => new Promise<"accept">(() => undefined),
        prompt: () => new Promise<string>(() => undefined),
      } as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })

    const confirmHandler = module.effectHandlers.get("confirm")!
    const promptHandler = module.effectHandlers.get("prompt")!

    confirmHandler({ data: { message: "first" }, label: "confirm" } as never)
    expect(() =>
      confirmHandler({
        data: { message: "second" },
        label: "confirm",
      } as never),
    ).toThrow("second confirm request")

    promptHandler({ data: { message: "first" }, label: "prompt" } as never)
    expect(() =>
      promptHandler({ data: { message: "second" }, label: "prompt" } as never),
    ).toThrow("second prompt request")
  })

  test("one-way browser handlers call corresponding driver methods", async () => {
    const timerDriver = createControlledTimerDriver()
    const driver = {
      alert: jest.fn(),
      copyToClipboard: jest.fn(async () => undefined),
      historyBack: jest.fn(),
      historyForward: jest.fn(),
      historyGo: jest.fn(),
      historyPushState: jest.fn(),
      historyReplaceState: jest.fn(),
      historySetScrollRestoration: jest.fn(),
      locationAssign: jest.fn(),
      locationReload: jest.fn(),
      locationReplace: jest.fn(),
      locationSetHash: jest.fn(),
      locationSetHost: jest.fn(),
      locationSetHostname: jest.fn(),
      locationSetHref: jest.fn(),
      locationSetPathname: jest.fn(),
      locationSetPort: jest.fn(),
      locationSetProtocol: jest.fn(),
      locationSetSearch: jest.fn(),
      openUrl: jest.fn(),
      postMessage: jest.fn(),
      printPage: jest.fn(),
    }
    const module = createRuntimeBrowserModule({
      browserDriver: driver as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })

    const call = (label: string, data: unknown) =>
      module.effectHandlers.get(label)!({ data, label } as never)

    call("alert", { message: "heads up" })
    call("copyToClipboard", { text: "copy me" })
    call("openUrl", {
      features: "noopener",
      target: "_blank",
      url: "https://example.com",
    })
    call("printPage", undefined)
    call("locationAssign", { url: "/next" })
    call("locationReplace", { url: "/replace" })
    call("locationReload", undefined)
    call("historyBack", undefined)
    call("historyForward", undefined)
    call("historyGo", { delta: -1 })
    call("historyPushState", { state: { page: "a" }, url: "/a" })
    call("historyReplaceState", { state: { page: "b" }, url: "/b" })
    call("historySetScrollRestoration", { value: "manual" })
    call("locationSetHash", { hash: "section" })
    call("locationSetHost", { host: "example.com" })
    call("locationSetHostname", { hostname: "example.com" })
    call("locationSetHref", { href: "https://example.com/a" })
    call("locationSetPathname", { pathname: "/p" })
    call("locationSetPort", { port: "8080" })
    call("locationSetProtocol", { protocol: "https:" })
    call("locationSetSearch", { search: "?q=1" })
    call("postMessage", { message: { type: "ping" }, targetOrigin: "*" })

    await Promise.resolve()
    await Promise.resolve()

    expect(driver.alert).toHaveBeenCalledWith("heads up")
    expect(driver.copyToClipboard).toHaveBeenCalledWith("copy me")
    expect(driver.openUrl).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener",
    )
    expect(driver.printPage).toHaveBeenCalled()
    expect(driver.locationAssign).toHaveBeenCalledWith("/next")
    expect(driver.locationReplace).toHaveBeenCalledWith("/replace")
    expect(driver.locationReload).toHaveBeenCalled()
    expect(driver.historyBack).toHaveBeenCalled()
    expect(driver.historyForward).toHaveBeenCalled()
    expect(driver.historyGo).toHaveBeenCalledWith(-1)
    expect(driver.historyPushState).toHaveBeenCalledWith({ page: "a" }, "/a")
    expect(driver.historyReplaceState).toHaveBeenCalledWith({ page: "b" }, "/b")
    expect(driver.historySetScrollRestoration).toHaveBeenCalledWith("manual")
    expect(driver.locationSetHash).toHaveBeenCalledWith("section")
    expect(driver.locationSetHost).toHaveBeenCalledWith("example.com")
    expect(driver.locationSetHostname).toHaveBeenCalledWith("example.com")
    expect(driver.locationSetHref).toHaveBeenCalledWith("https://example.com/a")
    expect(driver.locationSetPathname).toHaveBeenCalledWith("/p")
    expect(driver.locationSetPort).toHaveBeenCalledWith("8080")
    expect(driver.locationSetProtocol).toHaveBeenCalledWith("https:")
    expect(driver.locationSetSearch).toHaveBeenCalledWith("?q=1")
    expect(driver.postMessage).toHaveBeenCalledWith(
      { type: "ping" },
      "*",
      undefined,
    )
  })

  test("domMutate returns no-op when state is missing and mutates with state", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Editing")
    setStateResource({
      key: "target",
      state: state as never,
      value: { id: "el" },
    })

    const withState = createRuntimeBrowserModule({
      browserDriver: {} as never,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
      timerDriver,
    })
    const withoutState = createRuntimeBrowserModule({
      browserDriver: {} as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })
    const mutate = jest.fn()

    expect(
      withoutState.effectHandlers.get("domMutate")!({
        data: { fn: mutate, targetResourceId: "target" },
        label: "domMutate",
      } as never),
    ).toEqual([])
    expect(mutate).not.toHaveBeenCalled()

    expect(
      withState.effectHandlers.get("domMutate")!({
        data: { fn: mutate, targetResourceId: "target" },
        label: "domMutate",
      } as never),
    ).toEqual([])
    expect(mutate).toHaveBeenCalledWith({ id: "el" })
  })

  test("domAcquire query scope validation and closest element requirement", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Querying")

    setStateResource({
      key: "bad-scope",
      state: state as never,
      value: { id: "x" },
    })
    setStateResource({
      key: "query-like-scope",
      state: state as never,
      value: { querySelector: () => null },
    })

    const module = createRuntimeBrowserModule({
      browserDriver: {
        closest: jest.fn(),
      } as never,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
      timerDriver,
    })
    const acquire = module.effectHandlers.get("domAcquire")!

    expect(() =>
      acquire({
        data: {
          args: [".item"],
          kind: "query",
          method: "querySelector",
          resourceId: "item",
          scopeResourceId: "bad-scope",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("cannot be used as a DOM query scope")

    expect(() =>
      acquire({
        data: {
          args: [".item"],
          kind: "query",
          method: "closest",
          resourceId: "item",
          scopeResourceId: "query-like-scope",
        },
        label: "domAcquire",
      } as never),
    ).toThrow("must resolve to an Element to use closest")
  })

  test("domAcquire supports singleton/query branches and no-state path", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Querying")
    const driver = {
      activeElement: jest.fn(() => ({ id: "active" })),
      body: jest.fn(() => ({ id: "body" })),
      document: jest.fn(() => ({ id: "document" })),
      documentElement: jest.fn(() => ({ id: "documentElement" })),
      getElementById: jest.fn(() => ({ id: "one" })),
      getElementsByClassName: jest.fn(() => ["class"]),
      getElementsByName: jest.fn(() => ["name"]),
      getElementsByTagName: jest.fn(() => ["tag"]),
      history: jest.fn(() => ({ id: "history" })),
      location: jest.fn(() => ({ id: "location" })),
      querySelector: jest.fn(() => ({ id: "query" })),
      querySelectorAll: jest.fn(() => ["all"]),
      visualViewport: jest.fn(() => ({ id: "viewport" })),
      window: jest.fn(() => ({ id: "window" })),
    }

    const module = createRuntimeBrowserModule({
      browserDriver: driver as never,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
      timerDriver,
    })
    const noStateModule = createRuntimeBrowserModule({
      browserDriver: driver as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })
    const acquire = module.effectHandlers.get("domAcquire")!

    expect(
      noStateModule.effectHandlers.get("domAcquire")!({
        data: {
          kind: "singleton",
          resourceId: "window",
          target: "window",
        },
        label: "domAcquire",
      } as never),
    ).toEqual([])

    acquire({
      data: {
        kind: "singleton",
        resourceId: "location",
        target: "location",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        kind: "singleton",
        resourceId: "viewport",
        target: "visualViewport",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "getElementById",
        resourceId: "id",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "getElementsByClassName",
        resourceId: "class",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "getElementsByName",
        resourceId: "name",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "getElementsByTagName",
        resourceId: "tag",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "querySelector",
        resourceId: "single",
      },
      label: "domAcquire",
    } as never)
    acquire({
      data: {
        args: [],
        kind: "query",
        method: "querySelectorAll",
        resourceId: "all",
      },
      label: "domAcquire",
    } as never)

    expect(driver.location).toHaveBeenCalled()
    expect(driver.visualViewport).toHaveBeenCalled()
    expect(driver.getElementById).toHaveBeenCalledWith("", undefined)
    expect(driver.getElementsByClassName).toHaveBeenCalledWith("", undefined)
    expect(driver.getElementsByName).toHaveBeenCalledWith("", undefined)
    expect(driver.getElementsByTagName).toHaveBeenCalledWith("", undefined)
    expect(driver.querySelector).toHaveBeenCalledWith("", undefined)
    expect(driver.querySelectorAll).toHaveBeenCalledWith("", undefined)
  })

  test("domListen supports boolean options and ignores undefined actions", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { fire, target } = createMockEventTarget()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    module.effectHandlers.get("domListen")!({
      data: {
        options: true,
        targetResourceId: "el",
        toAction: () => undefined,
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    module.effectHandlers.get("domListen")!({
      data: {
        options: { capture: false, passive: true },
        targetResourceId: "el",
        toAction: () => Move({ x: 2 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(1)
    expect(runAction).toHaveBeenCalledWith(Move({ x: 2 }))
  })

  test("observers support no-state/custom id branches and clear no-op", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Watching")
    const target = { nodeType: 1 } as Element
    const observeIntersection = jest.fn()
    const observeResize = jest.fn()

    setStateResource({ key: "target", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: {
        createIntersectionObserver: () =>
          ({
            disconnect: jest.fn(),
            observe: observeIntersection,
          }) as never,
        createResizeObserver: () =>
          ({
            disconnect: jest.fn(),
            observe: observeResize,
          }) as never,
      } as never,
      getCurrentState: () => state as never,
      runAction: async () => undefined,
      timerDriver,
    })
    const noStateModule = createRuntimeBrowserModule({
      browserDriver: {
        createIntersectionObserver: jest.fn(),
        createResizeObserver: jest.fn(),
      } as never,
      getCurrentState: () => undefined,
      runAction: async () => undefined,
      timerDriver,
    })

    expect(
      noStateModule.effectHandlers.get("domObserveIntersection")!({
        data: {
          targetResourceId: "target",
          toAction: () => Move({ x: 1 }),
        },
        label: "domObserveIntersection",
      } as never),
    ).toEqual([])
    expect(
      noStateModule.effectHandlers.get("domObserveResize")!({
        data: {
          targetResourceId: "target",
          toAction: () => Move({ x: 1 }),
        },
        label: "domObserveResize",
      } as never),
    ).toEqual([])

    module.effectHandlers.get("domObserveIntersection")!({
      data: {
        observerId: "intersection:fixed",
        targetResourceId: "target",
        toAction: () => Move({ x: 1 }),
      },
      label: "domObserveIntersection",
    } as never)
    module.effectHandlers.get("domObserveResize")!({
      data: {
        observerId: "resize:fixed",
        targetResourceId: "target",
        toAction: () => Move({ x: 1 }),
      },
      label: "domObserveResize",
    } as never)

    expect(observeIntersection).toHaveBeenCalledWith(target)
    expect(observeResize).toHaveBeenCalledWith(target, undefined)

    module.clear()
    module.clearForGoBack()
  })

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

  test("once listeners unregister after first invocation", () => {
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

    module.effectHandlers.get("domListen")!({
      data: {
        options: { once: true },
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())
    fire("pointermove", createMockEvent())

    expect(runAction).toHaveBeenCalledTimes(1)
    expect((target.removeEventListener as jest.Mock).mock.calls.length).toBe(1)
  })

  test("abort signal can teardown listeners before first event", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()
    const controller = new AbortController()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    module.effectHandlers.get("domListen")!({
      data: {
        options: { signal: controller.signal },
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    controller.abort()
    fire("pointermove", createMockEvent())

    expect(runAction).not.toHaveBeenCalled()
    expect((target.removeEventListener as jest.Mock).mock.calls.length).toBe(1)
  })

  test("aborted signal before registration creates no-op listener", () => {
    const timerDriver = createControlledTimerDriver()
    const state = createState("Dragging")
    const runAction = jest.fn(async () => undefined)
    const { target, fire } = createMockEventTarget()
    const controller = new AbortController()
    controller.abort()

    setStateResource({ key: "el", state: state as never, value: target })

    const module = createRuntimeBrowserModule({
      browserDriver: createDomDriver(),
      getCurrentState: () => state as never,
      runAction,
      timerDriver,
    })

    module.effectHandlers.get("domListen")!({
      data: {
        options: { signal: controller.signal },
        targetResourceId: "el",
        toAction: () => Move({ x: 1 }),
        type: "pointermove",
      },
      label: "domListen",
    } as never)

    fire("pointermove", createMockEvent())

    expect(runAction).not.toHaveBeenCalled()
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
