import {
  confirmAccepted,
  confirmRejected,
  promptCancelled,
  promptSubmitted,
} from "../action.js"
import type {
  AlertEffectData,
  ConfirmEffectData,
  CopyToClipboardEffectData,
  HistoryGoEffectData,
  HistoryPushStateEffectData,
  HistoryReplaceStateEffectData,
  HistorySetScrollRestorationEffectData,
  LocationAssignEffectData,
  LocationReplaceEffectData,
  LocationSetHashEffectData,
  LocationSetHostEffectData,
  LocationSetHostnameEffectData,
  LocationSetHrefEffectData,
  LocationSetPathnameEffectData,
  LocationSetPortEffectData,
  LocationSetProtocolEffectData,
  LocationSetSearchEffectData,
  OpenUrlEffectData,
  PostMessageEffectData,
  PromptEffectData,
} from "../effect.js"
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

export type RuntimeBrowserModule = {
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

export const createRuntimeBrowserModule = (options: {
  browserDriver?: RuntimeBrowserDriver
  getCurrentState?: () => RuntimeState | undefined
  runAction: (action: RuntimeAction) => Promise<void>
}): RuntimeBrowserModule => {
  const driver = options.browserDriver

  let hasPendingConfirm = false
  let hasPendingPrompt = false

  const assertDriverMethod = <T>(
    methodName: string,
    method: T | undefined,
  ): T => {
    if (!method) {
      throw new Error(
        `Fizz browser driver is missing \`${methodName}\` but the corresponding effect was used.`,
      )
    }

    return method
  }

  const runOneWay = (run: () => void | Promise<void>): void => {
    void Promise.resolve()
      .then(run)
      .catch(() => void 0)
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

  const handleConfirm = (data: ConfirmEffectData): RuntimeDebugCommand[] => {
    if (hasPendingConfirm) {
      throw new Error(
        "Fizz received a second confirm request while one is pending",
      )
    }

    const confirmMethod = assertDriverMethod("confirm", driver?.confirm)

    hasPendingConfirm = true

    void Promise.resolve(confirmMethod(data.message))
      .then(result => {
        hasPendingConfirm = false

        const accepted = result === true || result === "accept"

        return options.runAction(
          accepted ? confirmAccepted() : confirmRejected(),
        )
      })
      .catch(() => {
        hasPendingConfirm = false

        return options.runAction(confirmRejected())
      })

    return []
  }

  const handlePrompt = (data: PromptEffectData): RuntimeDebugCommand[] => {
    if (hasPendingPrompt) {
      throw new Error(
        "Fizz received a second prompt request while one is pending",
      )
    }

    const promptMethod = assertDriverMethod("prompt", driver?.prompt)

    hasPendingPrompt = true

    void Promise.resolve(promptMethod(data.message))
      .then(value => {
        hasPendingPrompt = false

        return value === null
          ? options.runAction(promptCancelled())
          : options.runAction(promptSubmitted(value))
      })
      .catch(() => {
        hasPendingPrompt = false

        return options.runAction(promptCancelled())
      })

    return []
  }

  const handleAcquire = (data: DomAcquireEffectData): RuntimeDebugCommand[] => {
    const state = options.getCurrentState?.()

    if (!state) {
      return []
    }

    const value =
      data.kind === "singleton"
        ? acquireSingleton(data)
        : acquireQuery(state, data)

    setStateResource({
      key: data.resourceId,
      state,
      value,
    })

    return []
  }

  const handleListen = (data: DomListenEffectData): RuntimeDebugCommand[] => {
    const state = options.getCurrentState?.()

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
    const state = options.getCurrentState?.()

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
    const state = options.getCurrentState?.()

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

  const clear = () => {
    if (hasPendingConfirm) {
      hasPendingConfirm = false
      void options.runAction(confirmRejected())
    }

    if (hasPendingPrompt) {
      hasPendingPrompt = false
      void options.runAction(promptCancelled())
    }
  }

  return {
    clear,
    clearForGoBack: clear,
    clearForTransition: () => {
      // Confirm/prompt are runtime-owned and remain active across normal transitions.
      // DOM resources and subscriptions are state resources and are cleaned by the resource module.
    },
    effectHandlers: new Map([
      ["confirm", item => handleConfirm(item.data as ConfirmEffectData)],
      ["prompt", item => handlePrompt(item.data as PromptEffectData)],
      [
        "alert",
        item => {
          const alertMethod = assertDriverMethod("alert", driver?.alert)

          runOneWay(() => alertMethod((item.data as AlertEffectData).message))

          return []
        },
      ],
      [
        "copyToClipboard",
        item => {
          const copyMethod = assertDriverMethod(
            "copyToClipboard",
            driver?.copyToClipboard,
          )

          runOneWay(() =>
            copyMethod((item.data as CopyToClipboardEffectData).text),
          )

          return []
        },
      ],
      [
        "openUrl",
        item => {
          const openMethod = assertDriverMethod("openUrl", driver?.openUrl)
          const data = item.data as OpenUrlEffectData

          runOneWay(() => openMethod(data.url, data.target, data.features))

          return []
        },
      ],
      [
        "printPage",
        () => {
          const printMethod = assertDriverMethod("printPage", driver?.printPage)

          runOneWay(() => printMethod())

          return []
        },
      ],
      [
        "locationAssign",
        item => {
          const locationAssignMethod = assertDriverMethod(
            "locationAssign",
            driver?.locationAssign,
          )

          runOneWay(() =>
            locationAssignMethod((item.data as LocationAssignEffectData).url),
          )

          return []
        },
      ],
      [
        "locationReplace",
        item => {
          const locationReplaceMethod = assertDriverMethod(
            "locationReplace",
            driver?.locationReplace,
          )

          runOneWay(() =>
            locationReplaceMethod((item.data as LocationReplaceEffectData).url),
          )

          return []
        },
      ],
      [
        "locationReload",
        () => {
          const locationReloadMethod = assertDriverMethod(
            "locationReload",
            driver?.locationReload,
          )

          runOneWay(() => locationReloadMethod())

          return []
        },
      ],
      [
        "historyBack",
        () => {
          const historyBackMethod = assertDriverMethod(
            "historyBack",
            driver?.historyBack,
          )

          runOneWay(() => historyBackMethod())

          return []
        },
      ],
      [
        "historyForward",
        () => {
          const historyForwardMethod = assertDriverMethod(
            "historyForward",
            driver?.historyForward,
          )

          runOneWay(() => historyForwardMethod())

          return []
        },
      ],
      [
        "historyGo",
        item => {
          const historyGoMethod = assertDriverMethod(
            "historyGo",
            driver?.historyGo,
          )

          runOneWay(() =>
            historyGoMethod((item.data as HistoryGoEffectData).delta),
          )

          return []
        },
      ],
      [
        "historyPushState",
        item => {
          const historyPushStateMethod = assertDriverMethod(
            "historyPushState",
            driver?.historyPushState,
          )
          const data = item.data as HistoryPushStateEffectData

          runOneWay(() => historyPushStateMethod(data.state, data.url))

          return []
        },
      ],
      [
        "historyReplaceState",
        item => {
          const historyReplaceStateMethod = assertDriverMethod(
            "historyReplaceState",
            driver?.historyReplaceState,
          )
          const data = item.data as HistoryReplaceStateEffectData

          runOneWay(() => historyReplaceStateMethod(data.state, data.url))

          return []
        },
      ],
      [
        "historySetScrollRestoration",
        item => {
          const historySetScrollRestorationMethod = assertDriverMethod(
            "historySetScrollRestoration",
            driver?.historySetScrollRestoration,
          )
          const data = item.data as HistorySetScrollRestorationEffectData

          runOneWay(() => historySetScrollRestorationMethod(data.value))

          return []
        },
      ],
      [
        "locationSetHash",
        item => {
          const locationSetHashMethod = assertDriverMethod(
            "locationSetHash",
            driver?.locationSetHash,
          )

          runOneWay(() =>
            locationSetHashMethod(
              (item.data as LocationSetHashEffectData).hash,
            ),
          )

          return []
        },
      ],
      [
        "locationSetHost",
        item => {
          const locationSetHostMethod = assertDriverMethod(
            "locationSetHost",
            driver?.locationSetHost,
          )

          runOneWay(() =>
            locationSetHostMethod(
              (item.data as LocationSetHostEffectData).host,
            ),
          )

          return []
        },
      ],
      [
        "locationSetHostname",
        item => {
          const locationSetHostnameMethod = assertDriverMethod(
            "locationSetHostname",
            driver?.locationSetHostname,
          )

          runOneWay(() =>
            locationSetHostnameMethod(
              (item.data as LocationSetHostnameEffectData).hostname,
            ),
          )

          return []
        },
      ],
      [
        "locationSetHref",
        item => {
          const locationSetHrefMethod = assertDriverMethod(
            "locationSetHref",
            driver?.locationSetHref,
          )

          runOneWay(() =>
            locationSetHrefMethod(
              (item.data as LocationSetHrefEffectData).href,
            ),
          )

          return []
        },
      ],
      [
        "locationSetPathname",
        item => {
          const locationSetPathnameMethod = assertDriverMethod(
            "locationSetPathname",
            driver?.locationSetPathname,
          )

          runOneWay(() =>
            locationSetPathnameMethod(
              (item.data as LocationSetPathnameEffectData).pathname,
            ),
          )

          return []
        },
      ],
      [
        "locationSetPort",
        item => {
          const locationSetPortMethod = assertDriverMethod(
            "locationSetPort",
            driver?.locationSetPort,
          )

          runOneWay(() =>
            locationSetPortMethod(
              (item.data as LocationSetPortEffectData).port,
            ),
          )

          return []
        },
      ],
      [
        "locationSetProtocol",
        item => {
          const locationSetProtocolMethod = assertDriverMethod(
            "locationSetProtocol",
            driver?.locationSetProtocol,
          )

          runOneWay(() =>
            locationSetProtocolMethod(
              (item.data as LocationSetProtocolEffectData).protocol,
            ),
          )

          return []
        },
      ],
      [
        "locationSetSearch",
        item => {
          const locationSetSearchMethod = assertDriverMethod(
            "locationSetSearch",
            driver?.locationSetSearch,
          )

          runOneWay(() =>
            locationSetSearchMethod(
              (item.data as LocationSetSearchEffectData).search,
            ),
          )

          return []
        },
      ],
      [
        "postMessage",
        item => {
          const postMessageMethod = assertDriverMethod(
            "postMessage",
            driver?.postMessage,
          )
          const data = item.data as PostMessageEffectData

          runOneWay(() =>
            postMessageMethod(data.message, data.targetOrigin, data.transfer),
          )

          return []
        },
      ],
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
