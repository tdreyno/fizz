import type { RuntimeEffectHandlerRegistry } from "../runtime/effectDispatcher.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeState,
} from "../runtime/runtimeContracts.js"
import {
  getStateResources,
  listStateResourceKeys,
  setStateResource,
} from "../stateResources.js"
import type {
  DomAcquireEffectData,
  DomListenEffectData,
  DomObserveIntersectionEffectData,
  DomObserveResizeEffectData,
} from "./domEffects.js"
import type { RuntimeBrowserDriver } from "./runtimeBrowserDriver.js"

export type RuntimeDomModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

const isEventTarget = (value: unknown): value is EventTarget =>
  !!value &&
  typeof value === "object" &&
  "addEventListener" in value &&
  "removeEventListener" in value

const isElement = (value: unknown): value is Element =>
  !!value && typeof value === "object" && "nodeType" in value

export const createRuntimeDomModule = (options: {
  browserDriver?: RuntimeBrowserDriver
  getCurrentState: () => RuntimeState | undefined
  runAction: (action: RuntimeAction) => Promise<void>
}): RuntimeDomModule => {
  const driver = options.browserDriver

  const assertDriverMethod = <T>(
    methodName: string,
    method: T | undefined,
  ): T => {
    if (method !== undefined) {
      return method
    }

    throw new Error(
      `Fizz DOM driver is missing \`${methodName}\` but the corresponding DOM effect was used.`,
    )
  }

  const resolveResource = (
    state: RuntimeState,
    resourceId: string,
  ): unknown => {
    const resources = getStateResources(state)

    return resources[resourceId]
  }

  const nextGeneratedResourceKey = (
    state: RuntimeState,
    prefix: string,
  ): string => {
    const nextIndex =
      listStateResourceKeys(state).filter(key => key.startsWith(`${prefix}:`))
        .length + 1

    return `${prefix}:${nextIndex}`
  }

  const acquireSingleton = (
    data: Extract<DomAcquireEffectData, { kind: "singleton" }>,
  ): unknown => {
    if (data.target === "window") {
      return assertDriverMethod("window", driver?.window)()
    }

    if (data.target === "document") {
      return assertDriverMethod("document", driver?.document)()
    }

    if (data.target === "body") {
      return assertDriverMethod("body", driver?.body)()
    }

    if (data.target === "documentElement") {
      return assertDriverMethod("documentElement", driver?.documentElement)()
    }

    if (data.target === "activeElement") {
      return assertDriverMethod("activeElement", driver?.activeElement)()
    }

    if (data.target === "history") {
      return assertDriverMethod("history", driver?.history)()
    }

    if (data.target === "location") {
      return assertDriverMethod("location", driver?.location)()
    }

    return assertDriverMethod("visualViewport", driver?.visualViewport)()
  }

  const acquireQuery = (
    state: RuntimeState,
    data: Extract<DomAcquireEffectData, { kind: "query" }>,
  ): unknown => {
    const scope =
      data.scopeResourceId === undefined
        ? undefined
        : resolveResource(state, data.scopeResourceId)

    if (
      data.scopeResourceId !== undefined &&
      scope !== undefined &&
      !isElement(scope) &&
      !("querySelector" in (scope as object))
    ) {
      throw new Error(
        `Resource \`${data.scopeResourceId}\` cannot be used as a DOM query scope.`,
      )
    }

    if (data.method === "getElementById") {
      const getElementById = assertDriverMethod(
        "getElementById",
        driver?.getElementById,
      )

      return getElementById(data.args[0] ?? "", scope as Document | Element)
    }

    if (data.method === "getElementsByClassName") {
      const getElementsByClassName = assertDriverMethod(
        "getElementsByClassName",
        driver?.getElementsByClassName,
      )

      return getElementsByClassName(
        data.args[0] ?? "",
        scope as Document | Element,
      )
    }

    if (data.method === "getElementsByName") {
      const getElementsByName = assertDriverMethod(
        "getElementsByName",
        driver?.getElementsByName,
      )

      return getElementsByName(data.args[0] ?? "", scope as Document | Element)
    }

    if (data.method === "getElementsByTagName") {
      const getElementsByTagName = assertDriverMethod(
        "getElementsByTagName",
        driver?.getElementsByTagName,
      )

      return getElementsByTagName(
        data.args[0] ?? "",
        scope as Document | Element,
      )
    }

    if (data.method === "querySelector") {
      const querySelector = assertDriverMethod(
        "querySelector",
        driver?.querySelector,
      )

      return querySelector(data.args[0] ?? "", scope as Document | Element)
    }

    if (data.method === "querySelectorAll") {
      const querySelectorAll = assertDriverMethod(
        "querySelectorAll",
        driver?.querySelectorAll,
      )

      return querySelectorAll(data.args[0] ?? "", scope as Document | Element)
    }

    const closest = assertDriverMethod("closest", driver?.closest)

    if (!isElement(scope)) {
      throw new Error(
        `Resource \`${data.scopeResourceId ?? "(missing)"}\` must resolve to an Element to use closest().`,
      )
    }

    return closest(scope, data.args[0] ?? "")
  }

  const handleAcquire = (data: DomAcquireEffectData): RuntimeDebugCommand[] => {
    const state = options.getCurrentState()

    if (!state) {
      return []
    }

    let value: unknown

    if (data.kind === "singleton") {
      value = acquireSingleton(data)
    } else if (data.kind === "query") {
      value = acquireQuery(state, data)
    } else {
      value = data.element
    }

    setStateResource({
      key: data.resourceId,
      state,
      value,
    })

    return []
  }

  const handleListen = (data: DomListenEffectData): RuntimeDebugCommand[] => {
    const state = options.getCurrentState()

    if (!state) {
      return []
    }

    const target = resolveResource(state, data.targetResourceId)

    if (!isEventTarget(target)) {
      throw new Error(
        `Resource \`${data.targetResourceId}\` is not an EventTarget and cannot be used with listen().`,
      )
    }

    const addEventListener = assertDriverMethod(
      "addEventListener",
      driver?.addEventListener,
    )
    const removeEventListener = assertDriverMethod(
      "removeEventListener",
      driver?.removeEventListener,
    )

    const callback: EventListener = event => {
      void options.runAction(data.toAction(event))
    }

    addEventListener(target, data.type, callback, data.options)

    const key = nextGeneratedResourceKey(
      state,
      `dom:listen:${data.targetResourceId}:${data.type}`,
    )

    setStateResource({
      key,
      state,
      teardown: () => {
        removeEventListener(target, data.type, callback, data.options)
      },
      value: callback,
    })

    return []
  }

  const handleObserveIntersection = (
    data: DomObserveIntersectionEffectData,
  ): RuntimeDebugCommand[] => {
    const state = options.getCurrentState()

    if (!state) {
      return []
    }

    const target = resolveResource(state, data.targetResourceId)

    if (!isElement(target)) {
      throw new Error(
        `Resource \`${data.targetResourceId}\` is not an Element and cannot be observed by IntersectionObserver.`,
      )
    }

    const createObserver = assertDriverMethod(
      "createIntersectionObserver",
      driver?.createIntersectionObserver,
    )

    const observer = createObserver((entries, currentObserver) => {
      void options.runAction(data.toAction(entries, currentObserver))
    }, data.options)

    observer.observe(target)

    const observerId =
      data.observerId ??
      nextGeneratedResourceKey(state, `intersection:${data.targetResourceId}`)

    setStateResource({
      key: observerId,
      state,
      teardown: () => {
        observer.disconnect()
      },
      value: observer,
    })

    return []
  }

  const handleObserveResize = (
    data: DomObserveResizeEffectData,
  ): RuntimeDebugCommand[] => {
    const state = options.getCurrentState()

    if (!state) {
      return []
    }

    const target = resolveResource(state, data.targetResourceId)

    if (!isElement(target)) {
      throw new Error(
        `Resource \`${data.targetResourceId}\` is not an Element and cannot be observed by ResizeObserver.`,
      )
    }

    const createObserver = assertDriverMethod(
      "createResizeObserver",
      driver?.createResizeObserver,
    )

    const observer = createObserver((entries, currentObserver) => {
      void options.runAction(data.toAction(entries, currentObserver))
    }, data.options)

    observer.observe(target, data.options)

    const observerId =
      data.observerId ??
      nextGeneratedResourceKey(state, `resize:${data.targetResourceId}`)

    setStateResource({
      key: observerId,
      state,
      teardown: () => {
        observer.disconnect()
      },
      value: observer,
    })

    return []
  }

  return {
    clear: () => {
      // DOM resources and subscriptions are state resources and are cleaned by the resource module.
    },
    clearForGoBack: () => {
      // DOM resources and subscriptions are state resources and are cleaned by the resource module.
    },
    clearForTransition: () => {
      // DOM resources and subscriptions are state resources and are cleaned by the resource module.
    },
    effectHandlers: new Map([
      ["domAcquire", item => handleAcquire(item.data as DomAcquireEffectData)],
      ["domListen", item => handleListen(item.data as DomListenEffectData)],
      [
        "domObserveIntersection",
        item =>
          handleObserveIntersection(
            item.data as DomObserveIntersectionEffectData,
          ),
      ],
      [
        "domObserveResize",
        item => handleObserveResize(item.data as DomObserveResizeEffectData),
      ],
    ]),
  }
}
