import "./browser/index.js"

import type { Action } from "./action.js"
import type {
  BrowserConfirmResult,
  RuntimeBrowserDriver,
  RuntimeHistoryTarget,
  RuntimeLocationTarget,
} from "./browser/runtimeBrowserDriver.js"
import type { StateTransition } from "./state.js"
import type { TestHarness, TestHarnessOptions } from "./test.js"
import { createTestHarness } from "./test.js"

type AnyFunction = (...args: never[]) => unknown
type BrowserHarnessState = StateTransition<string, any, any>
type TestActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

export type RecordedFn<TArgs extends unknown[], TReturn> = ((
  ...args: TArgs
) => TReturn) & {
  calls: Array<TArgs>
  mockReturnValue: (value: TReturn) => void
  reset: () => void
}

type RecordedDriverMethod<T extends AnyFunction> = RecordedFn<
  Parameters<T>,
  ReturnType<T>
>

type BrowserEffectMethodNames =
  | "alert"
  | "confirm"
  | "copyToClipboard"
  | "historyBack"
  | "historyForward"
  | "historyGo"
  | "historyPushState"
  | "historyReplaceState"
  | "historySetScrollRestoration"
  | "locationAssign"
  | "locationReload"
  | "locationReplace"
  | "locationSetHash"
  | "locationSetHost"
  | "locationSetHostname"
  | "locationSetHref"
  | "locationSetPathname"
  | "locationSetPort"
  | "locationSetProtocol"
  | "locationSetSearch"
  | "openUrl"
  | "postMessage"
  | "printPage"
  | "prompt"

export type RecordedBrowserDriver = Omit<
  RuntimeBrowserDriver,
  BrowserEffectMethodNames
> & {
  alert: RecordedDriverMethod<NonNullable<RuntimeBrowserDriver["alert"]>>
  confirm: RecordedDriverMethod<NonNullable<RuntimeBrowserDriver["confirm"]>>
  copyToClipboard: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["copyToClipboard"]>
  >
  historyBack: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyBack"]>
  >
  historyForward: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyForward"]>
  >
  historyGo: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyGo"]>
  >
  historyPushState: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyPushState"]>
  >
  historyReplaceState: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyReplaceState"]>
  >
  historySetScrollRestoration: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historySetScrollRestoration"]>
  >
  locationAssign: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationAssign"]>
  >
  locationReload: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationReload"]>
  >
  locationReplace: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationReplace"]>
  >
  locationSetHash: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHash"]>
  >
  locationSetHost: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHost"]>
  >
  locationSetHostname: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHostname"]>
  >
  locationSetHref: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHref"]>
  >
  locationSetPathname: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetPathname"]>
  >
  locationSetPort: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetPort"]>
  >
  locationSetProtocol: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetProtocol"]>
  >
  locationSetSearch: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetSearch"]>
  >
  openUrl: RecordedDriverMethod<NonNullable<RuntimeBrowserDriver["openUrl"]>>
  postMessage: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["postMessage"]>
  >
  printPage: RecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["printPage"]>
  >
  prompt: RecordedDriverMethod<NonNullable<RuntimeBrowserDriver["prompt"]>>
}

export type BrowserTestHarness<
  State extends BrowserHarnessState,
  AM extends TestActionMap = Record<string, never>,
  OAM extends TestActionMap = Record<string, never>,
> = TestHarness<State, AM, OAM> & {
  browserDriver: RecordedBrowserDriver
  document: Document
  flushFrames: (count: number, frameMs?: number) => Promise<void>
}

export type BrowserTestHarnessOptions<
  State extends BrowserHarnessState,
  AM extends TestActionMap = Record<string, never>,
  OAM extends TestActionMap = Record<string, never>,
> = TestHarnessOptions<State, AM, OAM> & {
  browserDriver?: RuntimeBrowserDriver
  document?: Document
}

type BrowserEventInit<T extends EventInit> = Omit<T, "target"> & {
  target?: EventTarget | null
}

type FirePointerDragOptions = {
  end?: BrowserEventInit<PointerEventInit>
  moves?: BrowserEventInit<PointerEventInit>[]
  start?: BrowserEventInit<PointerEventInit>
}

type FireTextInputOptions = {
  change?: boolean
  focus?: boolean
  key?: string
  keydown?: boolean
  keyup?: boolean
  value: string
}

type FireFormSubmitOptions = {
  clickSubmitter?: boolean
  submitter?: HTMLElement | null
}

type EventConstructor = new (type: string, init?: object) => Event

type OutputLike = {
  type: string
}

const CLIPBOARD_EVENTS = new Set(["copy", "cut", "paste"])
const COMPOSITION_EVENTS = new Set([
  "compositionend",
  "compositionstart",
  "compositionupdate",
])
const DRAG_EVENTS = new Set([
  "drag",
  "dragend",
  "dragenter",
  "dragleave",
  "dragover",
  "dragstart",
  "drop",
])
const FOCUS_EVENTS = new Set(["blur", "focus", "focusin", "focusout"])
const INPUT_EVENTS = new Set(["beforeinput", "input"])
const KEYBOARD_EVENTS = new Set(["keydown", "keypress", "keyup"])
const MOUSE_EVENTS = new Set([
  "auxclick",
  "click",
  "contextmenu",
  "dblclick",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
])
const POINTER_EVENTS = new Set([
  "gotpointercapture",
  "lostpointercapture",
  "pointercancel",
  "pointerdown",
  "pointerenter",
  "pointerleave",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerrawupdate",
  "pointerup",
])
const SUBMIT_EVENTS = new Set(["submit"])
const TOUCH_EVENTS = new Set([
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
])
const TRANSITION_EVENTS = new Set([
  "transitioncancel",
  "transitionend",
  "transitionrun",
  "transitionstart",
])

const requireDocument = (value?: Document): Document => {
  if (value) {
    return value
  }

  if (globalThis.document !== undefined) {
    return globalThis.document
  }

  throw new Error(
    "Fizz browser test harness expected a Document. Pass options.document when the test environment does not provide globalThis.document.",
  )
}

const createRecordedMethod = <T extends AnyFunction>(options: {
  fallbackValue: ReturnType<T>
  implementation?: T
}): RecordedDriverMethod<T> => {
  const calls: Array<Parameters<T>> = []
  let hasMockValue = false
  let mockedValue = options.fallbackValue

  const fn = ((...args: Parameters<T>): ReturnType<T> => {
    calls.push(args)

    if (hasMockValue) {
      return mockedValue
    }

    if (options.implementation) {
      return options.implementation(...args) as ReturnType<T>
    }

    return options.fallbackValue
  }) as RecordedDriverMethod<T>

  fn.calls = calls
  fn.mockReturnValue = value => {
    hasMockValue = true
    mockedValue = value
  }
  fn.reset = () => {
    calls.splice(0, calls.length)
    hasMockValue = false
    mockedValue = options.fallbackValue
  }

  return fn
}

const createRecordedDriverMethod = <T extends AnyFunction>(options: {
  fallbackValue: ReturnType<T>
  implementation: T | undefined
}): RecordedDriverMethod<T> =>
  createRecordedMethod<T>({
    fallbackValue: options.fallbackValue,
    ...(options.implementation === undefined
      ? {}
      : { implementation: options.implementation }),
  })

const isDocument = (value: EventTarget | null | undefined): value is Document =>
  typeof value === "object" &&
  value !== null &&
  "createElement" in value &&
  "defaultView" in value

const isEventDispatcher = (
  value: EventTarget | null | undefined,
): value is EventTarget & { dispatchEvent: (event: Event) => boolean } =>
  typeof value === "object" &&
  value !== null &&
  "dispatchEvent" in value &&
  typeof value.dispatchEvent === "function"

const isWindow = (value: EventTarget | null | undefined): value is Window =>
  typeof value === "object" &&
  value !== null &&
  "document" in value &&
  "dispatchEvent" in value

const hasOwnerDocument = (
  value: EventTarget | null | undefined,
): value is EventTarget & { ownerDocument: Document | null } =>
  (() => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("ownerDocument" in value)
    ) {
      return false
    }

    const ownerDocument = (value as { ownerDocument?: unknown }).ownerDocument

    if (
      ownerDocument !== null &&
      ownerDocument !== undefined &&
      typeof ownerDocument !== "object"
    ) {
      return false
    }

    return (
      ownerDocument === null ||
      isDocument(ownerDocument as EventTarget | null | undefined)
    )
  })()

const resolveWindow = (
  value: EventTarget | null | undefined,
): Window | undefined => {
  if (isWindow(value)) {
    return value
  }

  if (isDocument(value)) {
    return value.defaultView ?? undefined
  }

  if (hasOwnerDocument(value)) {
    return value.ownerDocument?.defaultView ?? undefined
  }

  return undefined
}

const resolveConstructor = (
  target: EventTarget,
  constructorNames: string[],
): EventConstructor => {
  const win = resolveWindow(target)

  if (win) {
    const candidates = win as unknown as Record<string, unknown>

    for (const constructorName of constructorNames) {
      const candidate = candidates[constructorName]

      if (typeof candidate === "function") {
        return candidate as EventConstructor
      }
    }
  }

  return Event as unknown as EventConstructor
}

const constructorNamesForEventType = (type: string): string[] => {
  if (POINTER_EVENTS.has(type)) {
    return ["PointerEvent", "MouseEvent", "Event"]
  }

  if (MOUSE_EVENTS.has(type)) {
    return ["MouseEvent", "Event"]
  }

  if (FOCUS_EVENTS.has(type)) {
    return ["FocusEvent", "Event"]
  }

  if (KEYBOARD_EVENTS.has(type)) {
    return ["KeyboardEvent", "Event"]
  }

  if (INPUT_EVENTS.has(type)) {
    return ["InputEvent", "Event"]
  }

  if (SUBMIT_EVENTS.has(type)) {
    return ["SubmitEvent", "Event"]
  }

  if (DRAG_EVENTS.has(type)) {
    return ["DragEvent", "MouseEvent", "Event"]
  }

  if (TOUCH_EVENTS.has(type)) {
    return ["TouchEvent", "Event"]
  }

  if (CLIPBOARD_EVENTS.has(type)) {
    return ["ClipboardEvent", "Event"]
  }

  if (COMPOSITION_EVENTS.has(type)) {
    return ["CompositionEvent", "Event"]
  }

  if (type === "wheel") {
    return ["WheelEvent", "MouseEvent", "Event"]
  }

  if (type.startsWith("animation")) {
    return ["AnimationEvent", "Event"]
  }

  if (TRANSITION_EVENTS.has(type)) {
    return ["TransitionEvent", "Event"]
  }

  return ["Event"]
}

const createEvent = <T extends EventInit>(options: {
  constructorNames: string[]
  init?: BrowserEventInit<T>
  target: EventTarget
  type: string
}): {
  dispatchTarget: EventTarget & { dispatchEvent: (event: Event) => boolean }
  event: Event
} => {
  const explicitTarget = options.init?.target
  let dispatchTarget:
    | (EventTarget & {
        dispatchEvent: (event: Event) => boolean
      })
    | undefined

  if (isEventDispatcher(explicitTarget)) {
    dispatchTarget = explicitTarget
  } else if (isEventDispatcher(options.target)) {
    dispatchTarget = options.target
  }

  if (!dispatchTarget) {
    throw new Error("Expected an EventTarget with dispatchEvent().")
  }

  const eventInit = { ...((options.init ?? {}) as Record<string, unknown>) }

  delete eventInit["target"]

  const Constructor = resolveConstructor(
    dispatchTarget,
    options.constructorNames,
  )
  const event = new Constructor(options.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...eventInit,
  })

  for (const [key, value] of Object.entries(eventInit)) {
    if (key in event || value === undefined) {
      continue
    }

    Object.defineProperty(event, key, {
      configurable: true,
      enumerable: true,
      value,
    })
  }

  return { dispatchTarget, event }
}

const hasStringValue = (
  target: EventTarget,
): target is EventTarget & { value: string } =>
  typeof target === "object" &&
  target !== null &&
  "value" in target &&
  typeof target.value === "string"

const withDefaultTarget = <T extends EventInit>(
  init: BrowserEventInit<T> | undefined,
  target: EventTarget,
): BrowserEventInit<T> => {
  if (init?.target !== undefined) {
    return init
  }

  if (init === undefined) {
    return { target } as BrowserEventInit<T>
  }

  return {
    ...init,
    target,
  } as BrowserEventInit<T>
}

const createIntersectionObserverStub = (): IntersectionObserver =>
  ({
    disconnect: () => undefined,
    observe: () => undefined,
    root: null,
    rootMargin: "0px",
    takeRecords: () => [],
    thresholds: [],
    unobserve: () => undefined,
  }) as IntersectionObserver

const createResizeObserverStub = (): ResizeObserver =>
  ({
    disconnect: () => undefined,
    observe: () => undefined,
    unobserve: () => undefined,
  }) as ResizeObserver

const createHistoryTarget = (win?: Window): RuntimeHistoryTarget | null => {
  if (!win?.history) {
    return null
  }

  return {
    addEventListener: win.addEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
    get length() {
      return win.history.length
    },
    removeEventListener: win.removeEventListener.bind(win),
    get scrollRestoration() {
      return win.history.scrollRestoration
    },
    get state() {
      return win.history.state as unknown
    },
  }
}

const createLocationTarget = (win?: Window): RuntimeLocationTarget | null => {
  if (!win?.location) {
    return null
  }

  return {
    addEventListener: win.addEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
    get hash() {
      return win.location.hash
    },
    get host() {
      return win.location.host
    },
    get hostname() {
      return win.location.hostname
    },
    get href() {
      return win.location.href
    },
    get origin() {
      return win.location.origin
    },
    get pathname() {
      return win.location.pathname
    },
    get port() {
      return win.location.port
    },
    get protocol() {
      return win.location.protocol
    },
    removeEventListener: win.removeEventListener.bind(win),
    get search() {
      return win.location.search
    },
  }
}

const toDocumentScope = (
  doc: Document,
  scope?: Document | Element,
): Document | undefined => {
  if (!scope) {
    return doc
  }

  if (isDocument(scope)) {
    return scope
  }

  return undefined
}

const toQueryScope = (
  doc: Document,
  scope?: Document | Element,
): Document | Element => scope ?? doc

const createDocumentBrowserDriver = (doc: Document): RuntimeBrowserDriver => {
  const win = doc.defaultView ?? undefined

  return {
    activeElement: () => doc.activeElement,
    addEventListener: (target, type, listener, options) => {
      target.addEventListener(type, listener, options)
    },
    body: () => doc.body,
    closest: (target, selector) => target.closest(selector),
    createIntersectionObserver: (callback, _options, target) => {
      const targetWin = target?.ownerDocument?.defaultView ?? win

      if (targetWin?.IntersectionObserver) {
        return new targetWin.IntersectionObserver(callback)
      }

      return createIntersectionObserverStub()
    },
    createResizeObserver: (callback, _options, target) => {
      const targetWin = target?.ownerDocument?.defaultView ?? win

      if (targetWin?.ResizeObserver) {
        return new targetWin.ResizeObserver(callback)
      }

      return createResizeObserverStub()
    },
    document: () => doc,
    documentElement: () => doc.documentElement,
    getElementById: (id, scope) => {
      const documentScope = toDocumentScope(doc, scope)

      if (documentScope) {
        return documentScope.getElementById(id)
      }

      return toQueryScope(doc, scope).querySelector(`#${id}`)
    },
    getElementsByClassName: (className, scope) => [
      ...toQueryScope(doc, scope).getElementsByClassName(className),
    ],
    getElementsByName: (name, scope) => {
      const documentScope = toDocumentScope(doc, scope)

      if (documentScope) {
        return [...documentScope.getElementsByName(name)]
      }

      return [...toQueryScope(doc, scope).querySelectorAll(`[name="${name}"]`)]
    },
    getElementsByTagName: (tagName, scope) => [
      ...toQueryScope(doc, scope).getElementsByTagName(tagName),
    ],
    history: () => createHistoryTarget(win),
    location: () => createLocationTarget(win),
    querySelector: (selector, scope) =>
      toQueryScope(doc, scope).querySelector(selector),
    querySelectorAll: (selector, scope) => [
      ...toQueryScope(doc, scope).querySelectorAll(selector),
    ],
    removeEventListener: (target, type, listener, options) => {
      target.removeEventListener(type, listener, options)
    },
    visualViewport: () => win?.visualViewport ?? null,
    window: () => win ?? null,
  }
}

const createRecordedBrowserDriver = (
  driver: RuntimeBrowserDriver,
): RecordedBrowserDriver => ({
  ...driver,
  alert: createRecordedDriverMethod<NonNullable<RuntimeBrowserDriver["alert"]>>(
    {
      fallbackValue: undefined,
      implementation: driver.alert,
    },
  ),
  confirm: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["confirm"]>
  >({
    fallbackValue: false as BrowserConfirmResult,
    implementation: driver.confirm,
  }),
  copyToClipboard: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["copyToClipboard"]>
  >({
    fallbackValue: undefined,
    implementation: driver.copyToClipboard,
  }),
  historyBack: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyBack"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historyBack,
  }),
  historyForward: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyForward"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historyForward,
  }),
  historyGo: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyGo"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historyGo,
  }),
  historyPushState: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyPushState"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historyPushState,
  }),
  historyReplaceState: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historyReplaceState"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historyReplaceState,
  }),
  historySetScrollRestoration: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["historySetScrollRestoration"]>
  >({
    fallbackValue: undefined,
    implementation: driver.historySetScrollRestoration,
  }),
  locationAssign: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationAssign"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationAssign,
  }),
  locationReload: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationReload"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationReload,
  }),
  locationReplace: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationReplace"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationReplace,
  }),
  locationSetHash: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHash"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetHash,
  }),
  locationSetHost: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHost"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetHost,
  }),
  locationSetHostname: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHostname"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetHostname,
  }),
  locationSetHref: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetHref"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetHref,
  }),
  locationSetPathname: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetPathname"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetPathname,
  }),
  locationSetPort: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetPort"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetPort,
  }),
  locationSetProtocol: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetProtocol"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetProtocol,
  }),
  locationSetSearch: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["locationSetSearch"]>
  >({
    fallbackValue: undefined,
    implementation: driver.locationSetSearch,
  }),
  openUrl: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["openUrl"]>
  >({
    fallbackValue: undefined,
    implementation: driver.openUrl,
  }),
  postMessage: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["postMessage"]>
  >({
    fallbackValue: undefined,
    implementation: driver.postMessage,
  }),
  printPage: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["printPage"]>
  >({
    fallbackValue: undefined,
    implementation: driver.printPage,
  }),
  prompt: createRecordedDriverMethod<
    NonNullable<RuntimeBrowserDriver["prompt"]>
  >({
    fallbackValue: null,
    implementation: driver.prompt,
  }),
})

const resetRecordedBrowserDriver = (driver: RecordedBrowserDriver): void => {
  driver.alert.reset()
  driver.confirm.reset()
  driver.copyToClipboard.reset()
  driver.historyBack.reset()
  driver.historyForward.reset()
  driver.historyGo.reset()
  driver.historyPushState.reset()
  driver.historyReplaceState.reset()
  driver.historySetScrollRestoration.reset()
  driver.locationAssign.reset()
  driver.locationReload.reset()
  driver.locationReplace.reset()
  driver.locationSetHash.reset()
  driver.locationSetHost.reset()
  driver.locationSetHostname.reset()
  driver.locationSetHref.reset()
  driver.locationSetPathname.reset()
  driver.locationSetPort.reset()
  driver.locationSetProtocol.reset()
  driver.locationSetSearch.reset()
  driver.openUrl.reset()
  driver.postMessage.reset()
  driver.printPage.reset()
  driver.prompt.reset()
}

export const createBrowserTestHarness = <
  State extends BrowserHarnessState,
  AM extends TestActionMap = Record<string, never>,
  OAM extends TestActionMap = Record<string, never>,
>(
  options: BrowserTestHarnessOptions<State, AM, OAM>,
): BrowserTestHarness<State, AM, OAM> => {
  const document = requireDocument(options.document)
  const customBrowserDriver = options.browserDriver
  const browserDriver = createRecordedBrowserDriver({
    ...createDocumentBrowserDriver(document),
    ...(customBrowserDriver === undefined ? {} : { ...customBrowserDriver }),
  })
  const harness = createTestHarness({
    ...options,
    browserDriver,
  })
  const clearRecords = harness.clearRecords

  return {
    ...harness,
    browserDriver,
    document,
    flushFrames: (count, frameMs) => harness.advanceFrames(count, frameMs),
    clearRecords: () => {
      clearRecords()
      resetRecordedBrowserDriver(browserDriver)
    },
  }
}

export const flushFrames = (
  harness: Pick<BrowserTestHarness<any, any, any>, "advanceFrames">,
  count: number,
  frameMs?: number,
): Promise<void> => harness.advanceFrames(count, frameMs)

export const fireEvent = <T extends EventInit>(
  target: EventTarget,
  type: string,
  init?: BrowserEventInit<T>,
): void => {
  const { dispatchTarget, event } = createEvent({
    constructorNames: constructorNamesForEventType(type),
    ...(init === undefined ? {} : { init }),
    target,
    type,
  })

  dispatchTarget.dispatchEvent(event)
}

export const fireClick = (
  target: EventTarget,
  init?: BrowserEventInit<MouseEventInit>,
): void => {
  fireEvent(target, "click", init)
}

export const fireChange = (
  target: EventTarget,
  init?: BrowserEventInit<EventInit>,
): void => {
  fireEvent(target, "change", init)
}

export const fireInput = (
  target: EventTarget,
  init?: BrowserEventInit<InputEventInit>,
): void => {
  fireEvent(target, "input", init)
}

export const fireSubmit = (
  target: EventTarget,
  init?: BrowserEventInit<SubmitEventInit>,
): void => {
  fireEvent(target, "submit", init)
}

export const firePointerDown = (
  target: EventTarget,
  init?: BrowserEventInit<PointerEventInit>,
): void => {
  fireEvent(target, "pointerdown", init)
}

export const firePointerMove = (
  target: EventTarget,
  init?: BrowserEventInit<PointerEventInit>,
): void => {
  fireEvent(target, "pointermove", init)
}

export const firePointerUp = (
  target: EventTarget,
  init?: BrowserEventInit<PointerEventInit>,
): void => {
  fireEvent(target, "pointerup", init)
}

export const fireFocusIn = (
  target: EventTarget,
  init?: BrowserEventInit<FocusEventInit>,
): void => {
  fireEvent(target, "focusin", init)
}

export const fireFocusOut = (
  target: EventTarget,
  init?: BrowserEventInit<FocusEventInit>,
): void => {
  fireEvent(target, "focusout", init)
}

export const fireKeyDown = (
  target: EventTarget,
  init?: BrowserEventInit<KeyboardEventInit>,
): void => {
  fireEvent(target, "keydown", init)
}

export const fireKeyUp = (
  target: EventTarget,
  init?: BrowserEventInit<KeyboardEventInit>,
): void => {
  fireEvent(target, "keyup", init)
}

export const firePointerDrag = (
  target: EventTarget,
  options: FirePointerDragOptions = {},
): void => {
  const sequenceTarget = options.start?.target ?? target

  firePointerDown(target, options.start)

  options.moves?.forEach(move => {
    firePointerMove(target, withDefaultTarget(move, sequenceTarget))
  })

  firePointerUp(
    target,
    options.end === undefined
      ? withDefaultTarget(undefined, sequenceTarget)
      : withDefaultTarget(options.end, sequenceTarget),
  )
}

export const fireTextInput = (
  target: EventTarget,
  options: FireTextInputOptions,
): void => {
  const nextValue = options.value
  const key = options.key ?? nextValue.at(-1) ?? ""

  if (options.focus !== false) {
    fireFocusIn(target, withDefaultTarget(undefined, target))
  }

  if (options.keydown !== false && key.length > 0) {
    fireKeyDown(target, withDefaultTarget<KeyboardEventInit>({ key }, target))
  }

  if (!hasStringValue(target)) {
    throw new TypeError(
      "fireTextInput expected a target with a string value property.",
    )
  }

  target.value = nextValue
  fireInput(
    target,
    withDefaultTarget<InputEventInit>(
      {
        data: nextValue,
        inputType: "insertText",
      },
      target,
    ),
  )

  if (options.keyup !== false && key.length > 0) {
    fireKeyUp(target, withDefaultTarget<KeyboardEventInit>({ key }, target))
  }

  if (options.change !== false) {
    fireChange(target, withDefaultTarget(undefined, target))
  }
}

export const fireFormSubmit = (
  target: EventTarget,
  options: FireFormSubmitOptions = {},
): void => {
  const submitter = options.submitter ?? null

  if (submitter && options.clickSubmitter !== false) {
    fireClick(submitter, withDefaultTarget(undefined, submitter))
  }

  fireSubmit(
    target,
    withDefaultTarget<SubmitEventInit>(
      submitter === null
        ? undefined
        : {
            submitter,
          },
      target,
    ),
  )
}

export const expectCommandOrder = (
  harness: { outputs: () => OutputLike[] },
  expectedTypes: string[],
): void => {
  const actualTypes = harness.outputs().map(output => output.type)

  if (
    actualTypes.length !== expectedTypes.length ||
    actualTypes.some((type, index) => type !== expectedTypes[index])
  ) {
    throw new Error(
      `Expected output order ${JSON.stringify(expectedTypes)}, received ${JSON.stringify(actualTypes)}.`,
    )
  }
}
