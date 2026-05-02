import { registerRuntimeBrowserModuleFactory } from "../runtime/runtimeBrowserModuleRegistry.js"
import type {
  RuntimeBrowserDriver,
  RuntimeDomDriver,
} from "./runtimeBrowserDriver.js"
import { createRuntimeBrowserModule } from "./runtimeBrowserModule.js"

export * from "./domEffects.js"
export type { RuntimeDomDriver } from "./runtimeBrowserDriver.js"

registerRuntimeBrowserModuleFactory(options =>
  createRuntimeBrowserModule(options),
)

const assertBrowserMethod = <T>(
  methodName: string,
  method: T | undefined,
): T => {
  if (!method) {
    throw new Error(
      `Fizz browser driver expected globalThis.${methodName} to exist in this environment.`,
    )
  }

  return method
}

export type BrowserDriver = RuntimeBrowserDriver

const requireGlobal = <T>(value: T | null | undefined, message: string): T => {
  if (value !== undefined && value !== null) {
    return value
  }

  throw new Error(message)
}

const toScopeDocument = (scope?: Document | Element): Document | undefined => {
  if (!scope) {
    return globalThis.document
  }

  if ("getElementById" in scope) {
    return scope
  }

  return undefined
}

const toQueryScope = (
  scope?: Document | Element,
): Document | Element | undefined => scope ?? globalThis.document

const baseDomDriver: RuntimeDomDriver = {
  activeElement: () => globalThis.document?.activeElement ?? null,
  addEventListener: (target, type, listener, options) => {
    target.addEventListener(type, listener, options)
  },
  body: () => globalThis.document?.body ?? null,
  closest: (target, selector) => target.closest(selector),
  createIntersectionObserver: (callback, options) => {
    const Observer = requireGlobal(
      globalThis.IntersectionObserver,
      "Fizz DOM driver expected globalThis.IntersectionObserver to exist in this environment.",
    )

    return new Observer(callback, options)
  },
  createResizeObserver: callback => {
    const Observer = requireGlobal(
      globalThis.ResizeObserver,
      "Fizz DOM driver expected globalThis.ResizeObserver to exist in this environment.",
    )

    return new Observer(callback)
  },
  document: () => globalThis.document ?? null,
  documentElement: () => globalThis.document?.documentElement ?? null,
  getElementById: (id, scope) => {
    const documentScope = toScopeDocument(scope)

    if (documentScope) {
      return documentScope.getElementById(id)
    }

    return toQueryScope(scope)?.querySelector(`#${id}`) ?? null
  },
  getElementsByClassName: (className, scope) => {
    const queryScope = toQueryScope(scope)

    if (!queryScope) {
      return []
    }

    return [...queryScope.getElementsByClassName(className)]
  },
  getElementsByName: (name, scope) => {
    const documentScope = toScopeDocument(scope)

    if (documentScope) {
      return [...documentScope.getElementsByName(name)]
    }

    return [
      ...(toQueryScope(scope)?.querySelectorAll(`[name="${name}"]`) ?? []),
    ]
  },
  getElementsByTagName: (tagName, scope) => {
    const queryScope = toQueryScope(scope)

    if (!queryScope) {
      return []
    }

    return [...queryScope.getElementsByTagName(tagName)]
  },
  history: () => {
    const win = globalThis.window

    if (!win || !globalThis.history) {
      return null
    }

    return {
      addEventListener: win.addEventListener.bind(win),
      dispatchEvent: win.dispatchEvent.bind(win),
      get length() {
        return globalThis.history.length
      },
      removeEventListener: win.removeEventListener.bind(win),
      get scrollRestoration() {
        return globalThis.history.scrollRestoration
      },
      get state() {
        return globalThis.history.state as unknown
      },
    }
  },
  location: () => {
    const win = globalThis.window

    if (!win || !globalThis.location) {
      return null
    }

    return {
      addEventListener: win.addEventListener.bind(win),
      dispatchEvent: win.dispatchEvent.bind(win),
      get hash() {
        return globalThis.location.hash
      },
      get host() {
        return globalThis.location.host
      },
      get hostname() {
        return globalThis.location.hostname
      },
      get href() {
        return globalThis.location.href
      },
      get origin() {
        return globalThis.location.origin
      },
      get pathname() {
        return globalThis.location.pathname
      },
      get port() {
        return globalThis.location.port
      },
      get protocol() {
        return globalThis.location.protocol
      },
      removeEventListener: win.removeEventListener.bind(win),
      get search() {
        return globalThis.location.search
      },
    }
  },
  querySelector: (selector, scope) =>
    toQueryScope(scope)?.querySelector(selector) ?? null,
  querySelectorAll: (selector, scope) => [
    ...(toQueryScope(scope)?.querySelectorAll(selector) ?? []),
  ],
  removeEventListener: (target, type, listener, options) => {
    target.removeEventListener(type, listener, options)
  },
  visualViewport: () => globalThis.visualViewport ?? null,
  window: () => globalThis.window ?? null,
}

export const browserDriver: BrowserDriver = {
  ...baseDomDriver,
  alert: message => {
    const alertMethod = assertBrowserMethod("alert", globalThis.alert)

    alertMethod(message)
  },
  confirm: message => {
    const confirmMethod = assertBrowserMethod("confirm", globalThis.confirm)

    return confirmMethod(message)
  },
  copyToClipboard: text => {
    const clipboard = globalThis.navigator?.clipboard

    if (!clipboard || typeof clipboard.writeText !== "function") {
      throw new Error(
        "Fizz browser driver expected globalThis.navigator.clipboard.writeText to exist in this environment.",
      )
    }

    return clipboard.writeText(text)
  },
  historyBack: () => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.back()
  },
  historyForward: () => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.forward()
  },
  historyGo: delta => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.go(delta)
  },
  historyPushState: (state, url) => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.pushState(state, "", url)
  },
  historyReplaceState: (state, url) => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.replaceState(state, "", url)
  },
  historySetScrollRestoration: value => {
    const history = assertBrowserMethod("history", globalThis.history)

    history.scrollRestoration = value
  },
  locationAssign: url => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.assign(url)
  },
  locationReload: () => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.reload()
  },
  locationReplace: url => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.replace(url)
  },
  locationSetHash: hash => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.hash = hash
  },
  locationSetHost: host => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.host = host
  },
  locationSetHostname: hostname => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.hostname = hostname
  },
  locationSetHref: href => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.href = href
  },
  locationSetPathname: pathname => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.pathname = pathname
  },
  locationSetPort: port => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.port = port
  },
  locationSetProtocol: protocol => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.protocol = protocol
  },
  locationSetSearch: search => {
    const location = assertBrowserMethod("location", globalThis.location)

    location.search = search
  },
  openUrl: (url, target, features) => {
    const openMethod = assertBrowserMethod("open", globalThis.open)

    openMethod(url, target, features)
  },
  postMessage: (message, targetOrigin, transfer) => {
    const postMessageMethod = assertBrowserMethod(
      "postMessage",
      globalThis.postMessage,
    )

    postMessageMethod(message, targetOrigin, transfer)
  },
  printPage: () => {
    const printMethod = assertBrowserMethod("print", globalThis.print)

    printMethod()
  },
  prompt: message => {
    const promptMethod = assertBrowserMethod("prompt", globalThis.prompt)

    return promptMethod(message)
  },
}

export const domDriver: BrowserDriver = browserDriver
