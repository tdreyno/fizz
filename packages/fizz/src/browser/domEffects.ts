import type { Action } from "../action.js"
import { Effect, effect } from "../effect.js"
import type { DomEventHelperMap } from "./domEventHelpers.js"
import {
  DOCUMENT_EVENT_HELPERS,
  HISTORY_EVENT_HELPERS,
  HTML_ELEMENT_EVENT_HELPERS,
  LOCATION_EVENT_HELPERS,
  VISUAL_VIEWPORT_EVENT_HELPERS,
  WINDOW_EVENT_HELPERS,
} from "./domEventHelpers.js"

const resolveWindowFromTarget = (target: unknown): Window | undefined => {
  // Check if target is a Window
  if (
    typeof target === "object" &&
    target !== null &&
    "document" in target &&
    "dispatchEvent" in target
  ) {
    return target as Window
  }

  // Check if target is a Document
  if (
    typeof target === "object" &&
    target !== null &&
    "createElement" in target &&
    "defaultView" in target
  ) {
    const doc = target as Document
    return doc.defaultView ?? undefined
  }

  // Check if target has ownerDocument
  if (
    typeof target === "object" &&
    target !== null &&
    "ownerDocument" in target
  ) {
    const ownerDoc = (target as { ownerDocument?: unknown }).ownerDocument
    if (ownerDoc && typeof ownerDoc === "object" && "defaultView" in ownerDoc) {
      const doc = ownerDoc as Document
      return doc.defaultView ?? undefined
    }
  }

  return undefined
}

const getEventConstructor = (
  target: unknown,
  hasDetail: boolean,
): typeof Event | typeof CustomEvent => {
  const win = resolveWindowFromTarget(target)

  if (win) {
    if (
      hasDetail &&
      (win as unknown as Record<string, unknown>)["CustomEvent"]
    ) {
      return (win as unknown as Record<string, unknown>)[
        "CustomEvent"
      ] as typeof CustomEvent
    }
    if ((win as unknown as Record<string, unknown>)["Event"]) {
      return (win as unknown as Record<string, unknown>)[
        "Event"
      ] as typeof Event
    }
  }

  return hasDetail ? CustomEvent : Event
}

type AnyAction = Action<string, unknown>
type EventMapLike = object
type TextSelectionDirection = "backward" | "forward" | "none"

type EventFromMap<
  EventMap extends EventMapLike,
  EventType extends string,
> = EventType extends keyof EventMap
  ? EventMap[EventType] extends Event
    ? EventMap[EventType]
    : Event
  : Event

type DomSingletonTarget =
  | "activeElement"
  | "body"
  | "document"
  | "documentElement"
  | "history"
  | "location"
  | "visualViewport"
  | "window"

type DomQueryMethod =
  | "closest"
  | "getElementById"
  | "getElementsByClassName"
  | "getElementsByName"
  | "getElementsByTagName"
  | "ownerDocument"
  | "querySelector"
  | "querySelectorAll"

export type DomAcquireEffectData =
  | {
      element: unknown
      kind: "external"
      resourceId: string
    }
  | {
      kind: "singleton"
      resourceId: string
      target: DomSingletonTarget
    }
  | {
      args: string[]
      kind: "query"
      method: DomQueryMethod
      resourceId: string
      scopeResourceId?: string
    }

export type DomListenCoalesceMode = "animation-frame" | "microtask" | "none"
export type ListenOrder = "after-default" | "before-default" | "default"

export type DomListenEffectData = {
  coalesce?: DomListenCoalesceMode
  order?: ListenOrder
  options?: AddEventListenerOptions | boolean
  targetResourceId: string
  toAction: (event: Event) => AnyAction | undefined
  type: string
}

export type DomChainEffectData = {
  acquire: Effect<DomAcquireEffectData>
  listeners: ReadonlyArray<Effect<DomListenEffectData>>
}

export type DomObserveIntersectionEffectData = {
  observerId?: string
  options?: IntersectionObserverInit
  targetResourceId: string
  toAction: (
    entries: IntersectionObserverEntry[],
    observer: IntersectionObserver,
  ) => AnyAction
}

export type DomObserveResizeEffectData = {
  observerId?: string
  options?: ResizeObserverOptions
  targetResourceId: string
  toAction: (
    entries: ResizeObserverEntry[],
    observer: ResizeObserver,
  ) => AnyAction
}

export type DomMutateEffectData = {
  fn: (element: unknown) => void
  label?: string
  targetResourceId: string
}

export type ClassListReplaceEntry = readonly [string, string]

export type ClassListOperations = {
  add?: string | readonly string[]
  remove?: string | readonly string[]
  replace?: ClassListReplaceEntry | ReadonlyArray<ClassListReplaceEntry>
  toggle?: string | readonly string[]
}

export type DomListenOptions =
  | boolean
  | (AddEventListenerOptions & {
      coalesce?: DomListenCoalesceMode
      order?: ListenOrder
    })

export type KeyMatcher = {
  altKey?: boolean
  ctrlKey?: boolean
  key: string
  metaKey?: boolean
  shiftKey?: boolean
}

type FluentActionMapper<T> = (value: T) => AnyAction

type FluentDomListenBuilder<
  TEvent extends Event,
  TMapped = TEvent,
  TChain = Effect<unknown>,
> = {
  mapEvent: <TNext>(
    mapper: (value: TMapped) => TNext,
  ) => FluentDomListenBuilder<TEvent, TNext, TChain>
  matchesKey: (
    matcher: KeyMatcher | string,
  ) => FluentDomListenBuilder<TEvent, TMapped, TChain>
  noModifiers: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  matchesKeyCombo: (
    matcher: KeyMatcher,
  ) => FluentDomListenBuilder<TEvent, TMapped, TChain>
  once: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  onlyPrimaryButton: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  preventDefault: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  stopPropagation: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  when: (
    predicate: (event: TEvent, value: TMapped) => boolean,
  ) => FluentDomListenBuilder<TEvent, TMapped, TChain>
  withKeyRepeat: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  withoutKeyRepeat: () => FluentDomListenBuilder<TEvent, TMapped, TChain>
  chainToAction: (
    onMatch: FluentActionMapper<TMapped>,
    onNoMatch?: FluentActionMapper<TEvent>,
  ) => TChain
}

type DomEventHelperOverload<
  EventType extends string,
  EventMap extends EventMapLike,
  TChain,
> = {
  (
    toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
    options?: DomListenOptions,
  ): TChain
  (
    options?: DomListenOptions,
  ): FluentDomListenBuilder<
    EventFromMap<EventMap, EventType>,
    EventFromMap<EventMap, EventType>,
    TChain
  >
}

type TargetBuilderListenHelpers<
  EventMap extends EventMapLike,
  EventHelpers extends DomEventHelperMap<EventMap>,
  TChain,
> = {
  [EventType in keyof EventHelpers &
    string as EventHelpers[EventType] extends string
    ? EventHelpers[EventType]
    : never]: DomEventHelperOverload<EventType, EventMap, TChain>
}

type MethodsOf<T> = T extends object
  ? {
      [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
    }[keyof T]
  : never

type MethodNameOrString<T> = [MethodsOf<T>] extends [never]
  ? string
  : MethodsOf<T>

type MethodArgsOf<T, K> = K extends keyof T
  ? T[K] extends (...args: infer A) => unknown
    ? A
    : readonly unknown[]
  : readonly unknown[]

type CallMethodHelper<TElement, TResult = Effect<unknown>[]> = <
  TName extends MethodNameOrString<TElement>,
>(
  name: TName,
  ...args: MethodArgsOf<TElement, TName>
) => TResult

type ApplyMethodHelper<TElement, TResult = Effect<unknown>[]> = <
  TName extends MethodNameOrString<TElement>,
>(
  name: TName,
  args: MethodArgsOf<TElement, TName>,
) => TResult

type PropertyNameOrString<T> = T extends object
  ? [keyof T & string] extends [never]
    ? string
    : keyof T & string
  : string

type SetPropertyHelper<TElement, TResult = Effect<unknown>[]> = <
  TName extends PropertyNameOrString<TElement>,
>(
  name: TName,
  value: TName extends keyof TElement ? TElement[TName] : unknown,
) => TResult

type TargetBuilderMutationMethods<TElement, TChain> = {
  appendChildren: (...children: Node[]) => TChain
  applyMethod: ApplyMethodHelper<TElement, TChain>
  callMethod: CallMethodHelper<TElement, TChain>
  clearChildren: () => TChain
  classList: (ops: ClassListOperations) => TChain
  classListSet: (classes: readonly string[]) => TChain
  dispatchEvent: {
    (type: string, init?: EventInit | CustomEventInit<unknown>): TChain
    (event: Event): TChain
  }
  mutate: (fn: (element: TElement) => void) => TChain
  observeIntersection: {
    (
      toAction: (
        entries: IntersectionObserverEntry[],
        observer: IntersectionObserver,
      ) => AnyAction,
      options?: IntersectionObserverInit,
    ): TChain
    (
      observerId: string,
      toAction: (
        entries: IntersectionObserverEntry[],
        observer: IntersectionObserver,
      ) => AnyAction,
      options?: IntersectionObserverInit,
    ): TChain
  }
  observeResize: {
    (
      toAction: (
        entries: ResizeObserverEntry[],
        observer: ResizeObserver,
      ) => AnyAction,
      options?: ResizeObserverOptions,
    ): TChain
    (
      observerId: string,
      toAction: (
        entries: ResizeObserverEntry[],
        observer: ResizeObserver,
      ) => AnyAction,
      options?: ResizeObserverOptions,
    ): TChain
  }
  prependChildren: (...children: Node[]) => TChain
  replaceChildren: (...children: Node[]) => TChain
  setAttribute: (name: string, value: string) => TChain
  setChecked: (checked: boolean) => TChain
  setInnerHTML: (html: string) => TChain
  setProperty: SetPropertyHelper<TElement, TChain>
  setSelectionRange: (
    start: number,
    end: number,
    direction?: TextSelectionDirection,
  ) => TChain
  setText: (text: string) => TChain
  setValue: (value: string) => TChain
  resource: () => Effect<unknown>
}

interface ChainableTargetEffectReturn<EventMap extends EventMapLike, TElement>
  extends
    Array<Effect<unknown>>,
    TargetBuilderMutationMethods<
      TElement,
      ChainableTargetEffectReturn<EventMap, TElement>
    > {
  listen: {
    <EventType extends string>(
      type: EventType,
      toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
      options?: DomListenOptions,
    ): ChainableTargetEffectReturn<EventMap, TElement>
    <EventType extends string>(
      type: EventType,
      options?: DomListenOptions,
    ): FluentDomListenBuilder<
      EventFromMap<EventMap, EventType>,
      EventFromMap<EventMap, EventType>,
      ChainableTargetEffectReturn<EventMap, TElement>
    >
  }
}

type TargetBuilderBase<
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
> = Effect<DomChainEffectData> &
  TargetBuilderMutationMethods<
    TElement,
    ChainableTargetEffectReturn<EventMap, TElement>
  > & {
    listen: {
      <EventType extends string>(
        type: EventType,
        toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
        options?: DomListenOptions,
      ): TargetBuilder<EventMap, TElement, EventHelpers>
      <EventType extends string>(
        type: EventType,
        options?: DomListenOptions,
      ): FluentDomListenBuilder<
        EventFromMap<EventMap, EventType>,
        EventFromMap<EventMap, EventType>,
        TargetBuilder<EventMap, TElement, EventHelpers>
      >
    }
    ownerDocument: () => TargetBuilder<
      DocumentEventMap,
      Document,
      typeof DOCUMENT_EVENT_HELPERS
    >
  }

type TargetBuilder<
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
> = TargetBuilderBase<EventMap, TElement, EventHelpers> &
  TargetBuilderListenHelpers<
    EventMap,
    EventHelpers,
    TargetBuilderBase<EventMap, TElement, EventHelpers>
  >

type HistoryEventMap = { popstate: PopStateEvent }
type LocationEventMap = { hashchange: HashChangeEvent }

type HistoryBuilder = Effect<DomChainEffectData> &
  Pick<
    TargetBuilder<HistoryEventMap, History, typeof HISTORY_EVENT_HELPERS>,
    "listen" | "mutate" | "resource"
  > &
  TargetBuilderListenHelpers<
    HistoryEventMap,
    typeof HISTORY_EVENT_HELPERS,
    Effect<DomChainEffectData> &
      Pick<
        TargetBuilder<HistoryEventMap, History, typeof HISTORY_EVENT_HELPERS>,
        "listen" | "mutate" | "resource"
      >
  >
type LocationBuilder = Effect<DomChainEffectData> &
  Pick<
    TargetBuilder<LocationEventMap, Location, typeof LOCATION_EVENT_HELPERS>,
    "listen" | "mutate" | "resource"
  > &
  TargetBuilderListenHelpers<
    LocationEventMap,
    typeof LOCATION_EVENT_HELPERS,
    Effect<DomChainEffectData> &
      Pick<
        TargetBuilder<
          LocationEventMap,
          Location,
          typeof LOCATION_EVENT_HELPERS
        >,
        "listen" | "mutate" | "resource"
      >
  >

type DomFromBuilder = {
  closest: <TElement extends Element = Element>(
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementById: <TElement extends Element = Element>(
    id: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByClassName: <TElement extends Element = Element>(
    className: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByName: <TElement extends Element = Element>(
    name: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByTagName: <TElement extends Element = Element>(
    tagName: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  querySelector: <TElement extends Element = Element>(
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  querySelectorAll: <TElement extends Element = Element>(
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  input: (
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    HTMLInputElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  select: (
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    HTMLSelectElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  textarea: (
    selector: string,
    resourceId?: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    HTMLTextAreaElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
}

let autoResourceIdCounter = 0

const nextAutoResourceId = (prefix: string): string => {
  autoResourceIdCounter += 1
  return `${prefix}:${autoResourceIdCounter}`
}

const autoQueryResourceId = (method: DomQueryMethod, arg: string): string =>
  nextAutoResourceId(`query:${method}:${arg || "anon"}`)

const autoExternalResourceId = (): string => nextAutoResourceId("external")

const domAcquire = (data: DomAcquireEffectData): Effect<DomAcquireEffectData> =>
  effect("domAcquire", data)

const domListen = (data: DomListenEffectData): Effect<DomListenEffectData> =>
  effect("domListen", data)

const domObserveIntersection = (
  data: DomObserveIntersectionEffectData,
): Effect<DomObserveIntersectionEffectData> =>
  effect("domObserveIntersection", data)

const domObserveResize = (
  data: DomObserveResizeEffectData,
): Effect<DomObserveResizeEffectData> => effect("domObserveResize", data)

const domMutate = (data: DomMutateEffectData): Effect<DomMutateEffectData> =>
  effect("domMutate", data)

const isElementListLike = (
  value: unknown,
): value is ArrayLike<unknown> & Iterable<unknown> => {
  if (value == null || typeof value !== "object") {
    return false
  }

  if (typeof NodeList !== "undefined" && value instanceof NodeList) {
    return true
  }

  if (
    typeof HTMLCollection !== "undefined" &&
    value instanceof HTMLCollection
  ) {
    return true
  }

  return false
}

const forEachTarget = (
  target: unknown,
  apply: (node: unknown) => void,
): void => {
  if (target == null) {
    return
  }

  if (isElementListLike(target)) {
    for (const node of Array.from(target)) {
      apply(node)
    }
    return
  }

  apply(target)
}

const hasClassList = (
  node: unknown,
): node is { classList: DOMTokenList; className: string } =>
  !!node &&
  typeof node === "object" &&
  "classList" in node &&
  !!(node as { classList?: unknown }).classList

const toTokens = (
  value: string | readonly string[] | undefined,
): readonly string[] => {
  if (value === undefined) {
    return []
  }

  return typeof value === "string" ? [value] : value
}

const toReplaceEntries = (
  value:
    | ClassListReplaceEntry
    | ReadonlyArray<ClassListReplaceEntry>
    | undefined,
): ReadonlyArray<ClassListReplaceEntry> => {
  if (value === undefined) {
    return []
  }

  return Array.isArray(value[0])
    ? (value as readonly ClassListReplaceEntry[])
    : [value as ClassListReplaceEntry]
}

const applyClassListOps = (target: unknown, ops: ClassListOperations): void => {
  const remove = toTokens(ops.remove)
  const replace = toReplaceEntries(ops.replace)
  const toggle = toTokens(ops.toggle)
  const add = toTokens(ops.add)

  forEachTarget(target, node => {
    if (!hasClassList(node)) {
      return
    }

    const list = node.classList

    if (remove.length > 0) {
      list.remove(...remove)
    }

    for (const [oldToken, newToken] of replace) {
      list.replace(oldToken, newToken)
    }

    for (const token of toggle) {
      list.toggle(token)
    }

    if (add.length > 0) {
      list.add(...add)
    }
  })
}

const applyClassListSet = (
  target: unknown,
  classes: readonly string[],
): void => {
  const joined = classes.join(" ")

  forEachTarget(target, node => {
    if (!hasClassList(node)) {
      return
    }

    node.className = joined
  })
}

const invokeMethod = (
  target: unknown,
  name: string,
  args: readonly unknown[],
): void => {
  forEachTarget(target, node => {
    if (node == null || typeof node !== "object") {
      return
    }

    const method = (node as Record<string, unknown>)[name]

    if (typeof method !== "function") {
      return
    }

    ;(method as (...callArgs: unknown[]) => unknown).apply(node, [...args])
  })
}

const setValueOnTarget = (target: unknown, value: string): void => {
  forEachTarget(target, node => {
    if (node != null && typeof node === "object" && "value" in node) {
      Reflect.set(node, "value", value)
    }
  })
}

const setCheckedOnTarget = (target: unknown, checked: boolean): void => {
  forEachTarget(target, node => {
    if (node != null && typeof node === "object" && "checked" in node) {
      Reflect.set(node, "checked", checked)
    }
  })
}

const setTextOnTarget = (target: unknown, text: string): void => {
  forEachTarget(target, node => {
    if (node != null && typeof node === "object" && "textContent" in node) {
      Reflect.set(node, "textContent", text)
    }
  })
}

const setInnerHTMLOnTarget = (target: unknown, html: string): void => {
  forEachTarget(target, node => {
    if (node != null && typeof node === "object" && "innerHTML" in node) {
      Reflect.set(node, "innerHTML", html)
    }
  })
}

const replaceChildrenOnTarget = (
  target: unknown,
  children: readonly Node[],
): void => {
  forEachTarget(target, node => {
    if (
      node == null ||
      typeof node !== "object" ||
      !("replaceChildren" in node)
    ) {
      return
    }

    const replaceChildren = node.replaceChildren

    if (typeof replaceChildren !== "function") {
      return
    }

    ;(replaceChildren as (...nextChildren: Node[]) => void).call(
      node,
      ...children,
    )
  })
}

const appendChildrenOnTarget = (
  target: unknown,
  children: readonly Node[],
): void => {
  forEachTarget(target, node => {
    if (node == null || typeof node !== "object" || !("append" in node)) {
      return
    }

    const append = node.append

    if (typeof append !== "function") {
      return
    }

    ;(append as (...nextChildren: Node[]) => void).call(node, ...children)
  })
}

const prependChildrenOnTarget = (
  target: unknown,
  children: readonly Node[],
): void => {
  forEachTarget(target, node => {
    if (node == null || typeof node !== "object" || !("prepend" in node)) {
      return
    }

    const prepend = node.prepend

    if (typeof prepend !== "function") {
      return
    }

    ;(prepend as (...nextChildren: Node[]) => void).call(node, ...children)
  })
}

const setPropertyOnTarget = (
  target: unknown,
  name: string,
  value: unknown,
): void => {
  forEachTarget(target, node => {
    if (node == null || typeof node !== "object") {
      return
    }

    ;(node as Record<string, unknown>)[name] = value
  })
}

const setAttributeOnTarget = (
  target: unknown,
  name: string,
  value: string,
): void => {
  forEachTarget(target, node => {
    if (node == null || typeof node !== "object" || !("setAttribute" in node)) {
      return
    }

    const setAttribute = node.setAttribute

    if (typeof setAttribute !== "function") {
      return
    }

    ;(setAttribute as (name: string, value: string) => void).call(
      node,
      name,
      value,
    )
  })
}

const setSelectionRangeOnTarget = (
  target: unknown,
  start: number,
  end: number,
  direction?: TextSelectionDirection,
): void => {
  forEachTarget(target, node => {
    if (
      node == null ||
      typeof node !== "object" ||
      !("setSelectionRange" in node)
    ) {
      return
    }

    const setSelectionRange = node.setSelectionRange

    if (typeof setSelectionRange !== "function") {
      return
    }

    if (direction === undefined) {
      ;(setSelectionRange as (start: number, end: number) => void).call(
        node,
        start,
        end,
      )
      return
    }

    ;(
      setSelectionRange as (
        start: number,
        end: number,
        direction: TextSelectionDirection,
      ) => void
    ).call(node, start, end, direction)
  })
}

const dispatchEventOnTarget = (
  target: unknown,
  typeOrEvent: string | Event,
  init?: EventInit | CustomEventInit<unknown>,
): void => {
  if (typeof typeOrEvent !== "string") {
    forEachTarget(target, node => {
      if (
        node == null ||
        typeof node !== "object" ||
        !("dispatchEvent" in node)
      ) {
        return
      }

      const dispatch = node.dispatchEvent

      if (typeof dispatch !== "function") {
        return
      }

      ;(dispatch as (event: Event) => boolean).call(node, typeOrEvent)
    })
    return
  }

  const eventInit = {
    bubbles: true,
    cancelable: true,
    ...init,
  }

  const hasDetail = init != null && typeof init === "object" && "detail" in init

  forEachTarget(target, node => {
    if (
      node == null ||
      typeof node !== "object" ||
      !("dispatchEvent" in node)
    ) {
      return
    }

    const dispatch = node.dispatchEvent

    if (typeof dispatch !== "function") {
      return
    }

    const EventConstructor = getEventConstructor(node, hasDetail)
    const event = new EventConstructor(typeOrEvent, eventInit)

    ;(dispatch as (event: Event) => boolean).call(node, event)
  })
}

const formatClassListLabel = (ops: ClassListOperations): string => {
  const parts: string[] = []
  const remove = toTokens(ops.remove)
  const replace = toReplaceEntries(ops.replace)
  const toggle = toTokens(ops.toggle)
  const add = toTokens(ops.add)

  if (remove.length > 0) {
    parts.push(`remove:${remove.join(",")}`)
  }

  if (replace.length > 0) {
    parts.push(
      `replace:${replace.map(([from, to]) => [from, to].join("->")).join(",")}`,
    )
  }

  if (toggle.length > 0) {
    parts.push(`toggle:${toggle.join(",")}`)
  }

  if (add.length > 0) {
    parts.push(`add:${add.join(",")}`)
  }

  return `classList(${parts.join(" ")})`
}

const parseListenOptions = (eventOptions?: DomListenOptions) => {
  let coalesce: DomListenCoalesceMode | undefined
  let order: ListenOrder | undefined
  let listenerOptions: AddEventListenerOptions | boolean | undefined

  if (typeof eventOptions === "boolean") {
    listenerOptions = eventOptions
  } else if (eventOptions !== undefined) {
    const {
      coalesce: parsedCoalesce,
      order: parsedOrder,
      ...restOptions
    } = eventOptions

    coalesce = parsedCoalesce
    order = parsedOrder

    if (Object.keys(restOptions).length > 0) {
      listenerOptions = restOptions
    }
  }

  return {
    coalesce,
    order,
    listenerOptions,
  }
}

const isKeyboardEventLike = (
  event: Event,
): event is KeyboardEvent & {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  repeat: boolean
  shiftKey: boolean
} =>
  "key" in event &&
  typeof (event as { key: unknown }).key === "string" &&
  "altKey" in event &&
  "ctrlKey" in event &&
  "metaKey" in event &&
  "shiftKey" in event

const isMouseEventLike = (
  event: Event,
): event is MouseEvent & {
  button: number
} =>
  "button" in event && typeof (event as { button: unknown }).button === "number"

const hasNoModifiers = (event: Event): boolean => {
  if (!isKeyboardEventLike(event)) {
    return true
  }

  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

const matchesKey = (event: Event, matcher: KeyMatcher | string): boolean => {
  if (!isKeyboardEventLike(event)) {
    return false
  }

  if (typeof matcher === "string") {
    return event.key === matcher
  }

  if (event.key !== matcher.key) {
    return false
  }

  if (matcher.altKey !== undefined && event.altKey !== matcher.altKey) {
    return false
  }

  if (matcher.ctrlKey !== undefined && event.ctrlKey !== matcher.ctrlKey) {
    return false
  }

  if (matcher.metaKey !== undefined && event.metaKey !== matcher.metaKey) {
    return false
  }

  if (matcher.shiftKey !== undefined && event.shiftKey !== matcher.shiftKey) {
    return false
  }

  return true
}

const isDomNode = (value: unknown): value is Node => {
  if (typeof Node === "undefined") {
    return !!value && typeof value === "object" && "nodeType" in value
  }

  return value instanceof Node
}

const containsTargetNode = (
  element: Element | null | undefined,
  target: unknown,
): boolean => !!element && isDomNode(target) && element.contains(target)

const containsPathNode = (
  element: Element | null | undefined,
  path: ReadonlyArray<EventTarget>,
): boolean => !!element && path.some(item => item === element)

const getComposedPath = (
  event: Event,
): ReadonlyArray<EventTarget> | undefined => {
  if (!("composedPath" in event)) {
    return undefined
  }

  const composedPath = (event as Event & { composedPath?: () => EventTarget[] })
    .composedPath

  if (typeof composedPath !== "function") {
    return undefined
  }

  return composedPath()
}

const isOutsideTarget = (options: {
  event: Event
  includeTrigger?: Element | null | undefined
  inside: Array<Element | null | undefined>
}): boolean => {
  const target = options.event.target
  const path = getComposedPath(options.event)

  if (!isDomNode(target)) {
    return false
  }

  if (
    containsTargetNode(options.includeTrigger, target) ||
    (path !== undefined && containsPathNode(options.includeTrigger, path))
  ) {
    return false
  }

  return options.inside
    .filter(Boolean)
    .every(
      element =>
        !element?.contains(target) &&
        (path === undefined || !containsPathNode(element, path)),
    )
}

const createFluentListenBuilder = <
  TEvent extends Event,
  TMapped = TEvent,
  TChain = Effect<unknown>,
>(options: {
  appendListener: (listener: Effect<DomListenEffectData>) => TChain
  listenOptions?: DomListenOptions | undefined
  mapFromEvent?: (event: TEvent) => TMapped
  onNoMatch?: ((event: TEvent) => AnyAction | undefined) | undefined
  predicates?: Array<(event: TEvent) => boolean>
  runOnce?: boolean
  runPreventDefault?: boolean
  runStopPropagation?: boolean
  targetResourceId: string
  type: string
}): FluentDomListenBuilder<TEvent, TMapped, TChain> => {
  const mapFromEvent =
    options.mapFromEvent ?? ((event: TEvent) => event as unknown as TMapped)
  const predicates = options.predicates ?? []

  const createNext = <TNext>(next: {
    mapFromEvent?: (event: TEvent) => TNext
    onNoMatch?: ((event: TEvent) => AnyAction | undefined) | undefined
    predicates?: Array<(event: TEvent) => boolean>
    runOnce?: boolean
    runPreventDefault?: boolean
    runStopPropagation?: boolean
  }) => {
    const onNoMatch = next.onNoMatch ?? options.onNoMatch
    const runOnce = next.runOnce ?? options.runOnce
    const runPreventDefault =
      next.runPreventDefault ?? options.runPreventDefault
    const runStopPropagation =
      next.runStopPropagation ?? options.runStopPropagation

    return createFluentListenBuilder<TEvent, TNext, TChain>({
      appendListener: options.appendListener,
      listenOptions: options.listenOptions,
      mapFromEvent:
        next.mapFromEvent ??
        ((event: TEvent) => mapFromEvent(event) as unknown as TNext),
      predicates: next.predicates ?? predicates,
      ...(onNoMatch === undefined ? {} : { onNoMatch }),
      ...(runOnce === undefined ? {} : { runOnce }),
      ...(runPreventDefault === undefined ? {} : { runPreventDefault }),
      ...(runStopPropagation === undefined ? {} : { runStopPropagation }),
      targetResourceId: options.targetResourceId,
      type: options.type,
    })
  }

  return {
    chainToAction: (onMatch, onNoMatch) => {
      let hasTriggered = false
      const { coalesce, listenerOptions, order } = parseListenOptions(
        options.listenOptions,
      )

      return options.appendListener(
        domListen({
          ...(coalesce === undefined ? {} : { coalesce }),
          ...(order === undefined ? {} : { order }),
          ...(listenerOptions === undefined
            ? {}
            : { options: listenerOptions }),
          targetResourceId: options.targetResourceId,
          toAction: (event: Event) => {
            const typedEvent = event as TEvent

            if (options.runPreventDefault && "preventDefault" in typedEvent) {
              typedEvent.preventDefault()
            }

            if (options.runStopPropagation && "stopPropagation" in typedEvent) {
              typedEvent.stopPropagation()
            }

            if (options.runOnce && hasTriggered) {
              return undefined
            }

            const value = mapFromEvent(typedEvent)
            const passed = predicates.every(predicate => predicate(typedEvent))

            if (!passed) {
              if (onNoMatch) {
                return onNoMatch(typedEvent)
              }

              if (options.onNoMatch) {
                return options.onNoMatch(typedEvent)
              }

              return undefined
            }

            hasTriggered = options.runOnce ?? false

            return onMatch(value)
          },
          type: options.type,
        }),
      )
    },
    mapEvent: mapper =>
      createNext({
        mapFromEvent: (event: TEvent) => mapper(mapFromEvent(event)),
      }),
    matchesKey: matcher =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => matchesKey(event, matcher),
        ],
      }),
    matchesKeyCombo: matcher =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => matchesKey(event, matcher),
        ],
      }),
    noModifiers: () =>
      createNext({
        predicates: [...predicates, (event: TEvent) => hasNoModifiers(event)],
      }),
    once: () => createNext({ runOnce: true }),
    onlyPrimaryButton: () =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => isMouseEventLike(event) && event.button === 0,
        ],
      }),
    preventDefault: () => createNext({ runPreventDefault: true }),
    stopPropagation: () => createNext({ runStopPropagation: true }),
    when: predicate =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => predicate(event, mapFromEvent(event)),
        ],
      }),
    withKeyRepeat: () =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => isKeyboardEventLike(event) && event.repeat,
        ],
      }),
    withoutKeyRepeat: () =>
      createNext({
        predicates: [
          ...predicates,
          (event: TEvent) => isKeyboardEventLike(event) && !event.repeat,
        ],
      }),
  }
}

export const isBypassedLinkActivation = (event: MouseEvent): boolean =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.altKey ||
  event.ctrlKey ||
  event.metaKey ||
  event.shiftKey

const createTargetBuilder = <
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
>(options: {
  acquire: DomAcquireEffectData
  eventHelpers: EventHelpers
  resourceId: string
}): TargetBuilder<EventMap, TElement, EventHelpers> => {
  let builder = {} as TargetBuilder<EventMap, TElement, EventHelpers>

  const appendListenerToBuilder = (
    type: string,
    toAction: (event: Event) => AnyAction | undefined,
    listenOptions?: DomListenOptions,
  ): TargetBuilder<EventMap, TElement, EventHelpers> => {
    const data = builder.data!
    const { coalesce, listenerOptions, order } =
      parseListenOptions(listenOptions)

    data.listeners = [
      ...data.listeners,
      domListen({
        ...(coalesce === undefined ? {} : { coalesce }),
        ...(order === undefined ? {} : { order }),
        ...(listenerOptions === undefined ? {} : { options: listenerOptions }),
        targetResourceId: options.resourceId,
        toAction,
        type,
      }),
    ]

    return builder
  }

  const createMutateEffect = (fn: (element: unknown) => void, label?: string) =>
    domMutate({
      ...(label === undefined ? {} : { label }),
      fn,
      targetResourceId: options.resourceId,
    })

  const createObserveIntersectionEffect = (
    observerIdOrToAction:
      | string
      | ((
          entries: IntersectionObserverEntry[],
          observer: IntersectionObserver,
        ) => AnyAction),
    toActionOrOptions?:
      | ((
          entries: IntersectionObserverEntry[],
          observer: IntersectionObserver,
        ) => AnyAction)
      | IntersectionObserverInit,
    maybeOptions?: IntersectionObserverInit,
  ) => {
    const toAction =
      typeof observerIdOrToAction === "function"
        ? observerIdOrToAction
        : (toActionOrOptions as (
            entries: IntersectionObserverEntry[],
            observer: IntersectionObserver,
          ) => AnyAction)
    const observerId =
      typeof observerIdOrToAction === "string"
        ? observerIdOrToAction
        : undefined
    const observerOptions =
      typeof observerIdOrToAction === "function"
        ? (toActionOrOptions as IntersectionObserverInit | undefined)
        : maybeOptions

    return domObserveIntersection({
      ...(observerId === undefined ? {} : { observerId }),
      ...(observerOptions === undefined ? {} : { options: observerOptions }),
      targetResourceId: options.resourceId,
      toAction,
    })
  }

  const createObserveResizeEffect = (
    observerIdOrToAction:
      | string
      | ((
          entries: ResizeObserverEntry[],
          observer: ResizeObserver,
        ) => AnyAction),
    toActionOrOptions?:
      | ((
          entries: ResizeObserverEntry[],
          observer: ResizeObserver,
        ) => AnyAction)
      | ResizeObserverOptions,
    maybeOptions?: ResizeObserverOptions,
  ) => {
    const toAction =
      typeof observerIdOrToAction === "function"
        ? observerIdOrToAction
        : (toActionOrOptions as (
            entries: ResizeObserverEntry[],
            observer: ResizeObserver,
          ) => AnyAction)
    const observerId =
      typeof observerIdOrToAction === "string"
        ? observerIdOrToAction
        : undefined
    const observerOptions =
      typeof observerIdOrToAction === "function"
        ? (toActionOrOptions as ResizeObserverOptions | undefined)
        : maybeOptions

    return domObserveResize({
      ...(observerId === undefined ? {} : { observerId }),
      ...(observerOptions === undefined ? {} : { options: observerOptions }),
      targetResourceId: options.resourceId,
      toAction,
    })
  }

  const createChainableTargetEffects = (
    effects: Effect<unknown>[],
  ): ChainableTargetEffectReturn<EventMap, TElement> => {
    const chain = effects as ChainableTargetEffectReturn<EventMap, TElement>

    const appendEffect = (effectItem: Effect<unknown>) =>
      createChainableTargetEffects([...effects, effectItem])

    const listenOnChain = (
      type: string,
      toActionOrOptions?: ((event: Event) => AnyAction) | DomListenOptions,
      eventOptions?: DomListenOptions,
    ) => {
      if (typeof toActionOrOptions === "function") {
        appendListenerToBuilder(type, toActionOrOptions, eventOptions)

        return chain
      }

      return createFluentListenBuilder({
        appendListener: listener => {
          const data = builder.data!

          data.listeners = [...data.listeners, listener]
          return chain
        },
        listenOptions: toActionOrOptions,
        targetResourceId: options.resourceId,
        type,
      })
    }

    Object.assign(chain, {
      appendChildren: (...children: Node[]) =>
        appendEffect(
          createMutateEffect(
            element => appendChildrenOnTarget(element, children),
            "appendChildren",
          ),
        ),
      applyMethod: (name: string, args: readonly unknown[] = []) =>
        appendEffect(
          createMutateEffect(
            element => invokeMethod(element, name, args),
            `applyMethod(${name})`,
          ),
        ),
      callMethod: (name: string, ...args: readonly unknown[]) =>
        appendEffect(
          createMutateEffect(
            element => invokeMethod(element, name, args),
            `callMethod(${name})`,
          ),
        ),
      clearChildren: () =>
        appendEffect(
          createMutateEffect(
            element => replaceChildrenOnTarget(element, []),
            "clearChildren",
          ),
        ),
      classList: (ops: ClassListOperations) =>
        appendEffect(
          createMutateEffect(
            element => applyClassListOps(element, ops),
            formatClassListLabel(ops),
          ),
        ),
      classListSet: (classes: readonly string[]) =>
        appendEffect(
          createMutateEffect(
            element => applyClassListSet(element, classes),
            `classListSet(${classes.join(" ")})`,
          ),
        ),
      dispatchEvent: (
        typeOrEvent: string | Event,
        init?: EventInit | CustomEventInit<unknown>,
      ) =>
        appendEffect(
          createMutateEffect(
            element => dispatchEventOnTarget(element, typeOrEvent, init),
            typeof typeOrEvent === "string"
              ? `dispatchEvent(${typeOrEvent})`
              : `dispatchEvent(${typeOrEvent.type})`,
          ),
        ),
      listen: listenOnChain,
      mutate: (fn: (element: TElement) => void) =>
        appendEffect(createMutateEffect(fn as (element: unknown) => void)),
      observeIntersection: (
        observerIdOrToAction:
          | string
          | ((
              entries: IntersectionObserverEntry[],
              observer: IntersectionObserver,
            ) => AnyAction),
        toActionOrOptions?:
          | ((
              entries: IntersectionObserverEntry[],
              observer: IntersectionObserver,
            ) => AnyAction)
          | IntersectionObserverInit,
        maybeOptions?: IntersectionObserverInit,
      ) =>
        appendEffect(
          createObserveIntersectionEffect(
            observerIdOrToAction,
            toActionOrOptions,
            maybeOptions,
          ),
        ),
      observeResize: (
        observerIdOrToAction:
          | string
          | ((
              entries: ResizeObserverEntry[],
              observer: ResizeObserver,
            ) => AnyAction),
        toActionOrOptions?:
          | ((
              entries: ResizeObserverEntry[],
              observer: ResizeObserver,
            ) => AnyAction)
          | ResizeObserverOptions,
        maybeOptions?: ResizeObserverOptions,
      ) =>
        appendEffect(
          createObserveResizeEffect(
            observerIdOrToAction,
            toActionOrOptions,
            maybeOptions,
          ),
        ),
      prependChildren: (...children: Node[]) =>
        appendEffect(
          createMutateEffect(
            element => prependChildrenOnTarget(element, children),
            "prependChildren",
          ),
        ),
      replaceChildren: (...children: Node[]) =>
        appendEffect(
          createMutateEffect(
            element => replaceChildrenOnTarget(element, children),
            "replaceChildren",
          ),
        ),
      resource: () => builder,
      setAttribute: (name: string, value: string) =>
        appendEffect(
          createMutateEffect(
            element => setAttributeOnTarget(element, name, value),
            `setAttribute(${name})`,
          ),
        ),
      setChecked: (checked: boolean) =>
        appendEffect(
          createMutateEffect(
            element => setCheckedOnTarget(element, checked),
            `setChecked(${checked ? "true" : "false"})`,
          ),
        ),
      setInnerHTML: (html: string) =>
        appendEffect(
          createMutateEffect(
            element => setInnerHTMLOnTarget(element, html),
            "setInnerHTML",
          ),
        ),
      setProperty: (name: string, value: unknown) =>
        appendEffect(
          createMutateEffect(
            element => setPropertyOnTarget(element, name, value),
            `setProperty(${name})`,
          ),
        ),
      setSelectionRange: (
        start: number,
        end: number,
        direction?: TextSelectionDirection,
      ) =>
        appendEffect(
          createMutateEffect(
            element =>
              setSelectionRangeOnTarget(element, start, end, direction),
            direction === undefined
              ? `setSelectionRange(${start},${end})`
              : `setSelectionRange(${start},${end},${direction})`,
          ),
        ),
      setText: (text: string) =>
        appendEffect(
          createMutateEffect(
            element => setTextOnTarget(element, text),
            "setText",
          ),
        ),
      setValue: (value: string) =>
        appendEffect(
          createMutateEffect(
            element => setValueOnTarget(element, value),
            "setValue",
          ),
        ),
    })

    for (const [type, helperName] of Object.entries(options.eventHelpers)) {
      if (!helperName) {
        continue
      }

      const target = chain as unknown as Record<string, unknown>
      const helperKey = helperName as string

      target[helperKey] = (
        toActionOrOptions?: ((event: Event) => AnyAction) | DomListenOptions,
        eventOptions?: DomListenOptions,
      ) =>
        typeof toActionOrOptions === "function"
          ? listenOnChain(type, toActionOrOptions, eventOptions)
          : listenOnChain(type, toActionOrOptions)
    }

    return chain
  }

  builder = Object.assign(
    effect("domChain", {
      acquire: domAcquire(options.acquire),
      listeners: [] as Array<Effect<DomListenEffectData>>,
    }),
    {
      appendChildren: (...children: Node[]) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => appendChildrenOnTarget(element, children),
            "appendChildren",
          ),
        ]),
      applyMethod: (name: string, args: readonly unknown[] = []) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => invokeMethod(element, name, args),
            `applyMethod(${name})`,
          ),
        ]),
      callMethod: (name: string, ...args: readonly unknown[]) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => invokeMethod(element, name, args),
            `callMethod(${name})`,
          ),
        ]),
      clearChildren: () =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => replaceChildrenOnTarget(element, []),
            "clearChildren",
          ),
        ]),
      classList: (ops: ClassListOperations) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => applyClassListOps(element, ops),
            formatClassListLabel(ops),
          ),
        ]),
      classListSet: (classes: readonly string[]) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => applyClassListSet(element, classes),
            `classListSet(${classes.join(" ")})`,
          ),
        ]),
      dispatchEvent: (
        typeOrEvent: string | Event,
        init?: EventInit | CustomEventInit<unknown>,
      ) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => dispatchEventOnTarget(element, typeOrEvent, init),
            typeof typeOrEvent === "string"
              ? `dispatchEvent(${typeOrEvent})`
              : `dispatchEvent(${typeOrEvent.type})`,
          ),
        ]),
      ownerDocument: () =>
        createOwnerDocumentBuilder({
          resourceId: autoQueryResourceId("ownerDocument", ""),
          scopeResourceId: options.resourceId,
        }),
      listen: (
        type: string,
        toActionOrOptions?: ((event: Event) => AnyAction) | DomListenOptions,
        eventOptions?: DomListenOptions,
      ) => {
        if (typeof toActionOrOptions === "function") {
          return appendListenerToBuilder(type, toActionOrOptions, eventOptions)
        }

        return createFluentListenBuilder({
          appendListener: listener => {
            const data = builder.data!

            data.listeners = [...data.listeners, listener]
            return builder
          },
          listenOptions: toActionOrOptions,
          targetResourceId: options.resourceId,
          type,
        })
      },
      mutate: (fn: (element: TElement) => void) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(fn as (element: unknown) => void),
        ]),
      observeIntersection: (
        observerIdOrToAction:
          | string
          | ((
              entries: IntersectionObserverEntry[],
              observer: IntersectionObserver,
            ) => AnyAction),
        toActionOrOptions?:
          | ((
              entries: IntersectionObserverEntry[],
              observer: IntersectionObserver,
            ) => AnyAction)
          | IntersectionObserverInit,
        maybeOptions?: IntersectionObserverInit,
      ) =>
        createChainableTargetEffects([
          builder,
          createObserveIntersectionEffect(
            observerIdOrToAction,
            toActionOrOptions,
            maybeOptions,
          ),
        ]),
      observeResize: (
        observerIdOrToAction:
          | string
          | ((
              entries: ResizeObserverEntry[],
              observer: ResizeObserver,
            ) => AnyAction),
        toActionOrOptions?:
          | ((
              entries: ResizeObserverEntry[],
              observer: ResizeObserver,
            ) => AnyAction)
          | ResizeObserverOptions,
        maybeOptions?: ResizeObserverOptions,
      ) =>
        createChainableTargetEffects([
          builder,
          createObserveResizeEffect(
            observerIdOrToAction,
            toActionOrOptions,
            maybeOptions,
          ),
        ]),
      prependChildren: (...children: Node[]) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => prependChildrenOnTarget(element, children),
            "prependChildren",
          ),
        ]),
      replaceChildren: (...children: Node[]) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => replaceChildrenOnTarget(element, children),
            "replaceChildren",
          ),
        ]),
      resource: () => builder,
      setAttribute: (name: string, value: string) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setAttributeOnTarget(element, name, value),
            `setAttribute(${name})`,
          ),
        ]),
      setChecked: (checked: boolean) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setCheckedOnTarget(element, checked),
            `setChecked(${checked ? "true" : "false"})`,
          ),
        ]),
      setInnerHTML: (html: string) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setInnerHTMLOnTarget(element, html),
            "setInnerHTML",
          ),
        ]),
      setProperty: (name: string, value: unknown) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setPropertyOnTarget(element, name, value),
            `setProperty(${name})`,
          ),
        ]),
      setSelectionRange: (
        start: number,
        end: number,
        direction?: TextSelectionDirection,
      ) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element =>
              setSelectionRangeOnTarget(element, start, end, direction),
            direction === undefined
              ? `setSelectionRange(${start},${end})`
              : `setSelectionRange(${start},${end},${direction})`,
          ),
        ]),
      setText: (text: string) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setTextOnTarget(element, text),
            "setText",
          ),
        ]),
      setValue: (value: string) =>
        createChainableTargetEffects([
          builder,
          createMutateEffect(
            element => setValueOnTarget(element, value),
            "setValue",
          ),
        ]),
    },
  ) as unknown as TargetBuilder<EventMap, TElement, EventHelpers>

  for (const [type, helperName] of Object.entries(options.eventHelpers)) {
    if (!helperName) {
      continue
    }

    const target = builder as unknown as Record<string, unknown>
    const helperKey = helperName as string

    target[helperKey] = (
      toActionOrOptions?: ((event: Event) => AnyAction) | DomListenOptions,
      eventOptions?: DomListenOptions,
    ) =>
      typeof toActionOrOptions === "function"
        ? builder.listen(type, toActionOrOptions, eventOptions)
        : builder.listen(type, toActionOrOptions)
  }

  return builder
}

const createSingletonBuilder = <
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
>(
  eventHelpers: EventHelpers,
  target: DomSingletonTarget,
  resourceId: string,
): TargetBuilder<EventMap, TElement, EventHelpers> =>
  createTargetBuilder<EventMap, TElement, EventHelpers>({
    acquire: {
      kind: "singleton",
      resourceId,
      target,
    },
    eventHelpers,
    resourceId,
  })

const createExternalBuilder = <
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
>(
  eventHelpers: EventHelpers,
  element: TElement,
  resourceId: string = autoExternalResourceId(),
): TargetBuilder<EventMap, TElement, EventHelpers> =>
  createTargetBuilder<EventMap, TElement, EventHelpers>({
    acquire: {
      element,
      kind: "external",
      resourceId,
    },
    eventHelpers,
    resourceId,
  })

const createHistoryBuilder = (resourceId: string): HistoryBuilder => {
  const builder = createSingletonBuilder<
    HistoryEventMap,
    History,
    typeof HISTORY_EVENT_HELPERS
  >(HISTORY_EVENT_HELPERS, "history", resourceId)

  return builder
}

const createLocationBuilder = (resourceId: string): LocationBuilder => {
  const builder = createSingletonBuilder<
    LocationEventMap,
    Location,
    typeof LOCATION_EVENT_HELPERS
  >(LOCATION_EVENT_HELPERS, "location", resourceId)

  return builder
}

const createQueryBuilder = <TElement extends Element = Element>(options: {
  args: string[]
  method: DomQueryMethod
  resourceId: string | undefined
  scopeResourceId?: string
}): TargetBuilder<
  HTMLElementEventMap,
  TElement,
  typeof HTML_ELEMENT_EVENT_HELPERS
> => {
  const resourceId =
    options.resourceId ??
    autoQueryResourceId(options.method, options.args[0] ?? "")

  return createTargetBuilder<
    HTMLElementEventMap,
    TElement,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >({
    acquire: {
      args: options.args,
      kind: "query",
      method: options.method,
      resourceId,
      ...(options.scopeResourceId === undefined
        ? {}
        : { scopeResourceId: options.scopeResourceId }),
    },
    eventHelpers: HTML_ELEMENT_EVENT_HELPERS,
    resourceId,
  })
}

const createOwnerDocumentBuilder = (options: {
  resourceId: string
  scopeResourceId: string
}): TargetBuilder<DocumentEventMap, Document, typeof DOCUMENT_EVENT_HELPERS> =>
  createTargetBuilder<
    DocumentEventMap,
    Document,
    typeof DOCUMENT_EVENT_HELPERS
  >({
    acquire: {
      args: [],
      kind: "query",
      method: "ownerDocument",
      resourceId: options.resourceId,
      scopeResourceId: options.scopeResourceId,
    },
    eventHelpers: DOCUMENT_EVENT_HELPERS,
    resourceId: options.resourceId,
  })

const createFromBuilder = (scopeResourceId: string): DomFromBuilder => {
  const queryBuilder = <TElement extends Element = Element>(
    method: DomQueryMethod,
    args: string[],
    resourceId: string | undefined,
  ) =>
    createQueryBuilder<TElement>({
      args,
      method,
      resourceId,
      scopeResourceId,
    })

  return {
    closest: (selector, resourceId) =>
      queryBuilder("closest", [selector], resourceId),
    getElementById: (id, resourceId) =>
      queryBuilder("getElementById", [id], resourceId),
    getElementsByClassName: (className, resourceId) =>
      queryBuilder("getElementsByClassName", [className], resourceId),
    getElementsByName: (name, resourceId) =>
      queryBuilder("getElementsByName", [name], resourceId),
    getElementsByTagName: (tagName, resourceId) =>
      queryBuilder("getElementsByTagName", [tagName], resourceId),
    querySelector: (selector, resourceId) =>
      queryBuilder("querySelector", [selector], resourceId),
    querySelectorAll: (selector, resourceId) =>
      queryBuilder("querySelectorAll", [selector], resourceId),
    input: (selector, resourceId) =>
      queryBuilder<HTMLInputElement>("querySelector", [selector], resourceId),
    select: (selector, resourceId) =>
      queryBuilder<HTMLSelectElement>("querySelector", [selector], resourceId),
    textarea: (selector, resourceId) =>
      queryBuilder<HTMLTextAreaElement>(
        "querySelector",
        [selector],
        resourceId,
      ),
  }
}

export const dom = {
  outsideFocusIn: (options: {
    includeTrigger?: Element | null
    inside: Array<Element | null | undefined>
  }) =>
    createSingletonBuilder<
      DocumentEventMap,
      Document,
      typeof DOCUMENT_EVENT_HELPERS
    >(DOCUMENT_EVENT_HELPERS, "document", "document")
      .onFocusIn()
      .when(event =>
        isOutsideTarget({
          event,
          includeTrigger: options.includeTrigger,
          inside: options.inside,
        }),
      ),
  outsidePointerDown: (options: {
    includeTrigger?: Element | null
    inside: Array<Element | null | undefined>
  }) =>
    createSingletonBuilder<
      DocumentEventMap,
      Document,
      typeof DOCUMENT_EVENT_HELPERS
    >(DOCUMENT_EVENT_HELPERS, "document", "document")
      .onPointerDown()
      .when(event =>
        isOutsideTarget({
          event,
          includeTrigger: options.includeTrigger,
          inside: options.inside,
        }),
      ),
  activeElement: (resourceId = "activeElement") =>
    createSingletonBuilder<
      HTMLElementEventMap,
      Element,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >(HTML_ELEMENT_EVENT_HELPERS, "activeElement", resourceId),
  body: (resourceId = "body") =>
    createSingletonBuilder<
      HTMLElementEventMap,
      HTMLBodyElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >(HTML_ELEMENT_EVENT_HELPERS, "body", resourceId),
  closest: <TElement extends Element = Element>(
    sourceResourceId: string,
    selector: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [selector],
      method: "closest",
      resourceId,
      scopeResourceId: sourceResourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  document: (resourceId = "document") =>
    createSingletonBuilder<
      DocumentEventMap,
      Document,
      typeof DOCUMENT_EVENT_HELPERS
    >(DOCUMENT_EVENT_HELPERS, "document", resourceId),
  documentElement: (resourceId = "documentElement") =>
    createSingletonBuilder<
      HTMLElementEventMap,
      HTMLHtmlElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >(HTML_ELEMENT_EVENT_HELPERS, "documentElement", resourceId),
  from: (scopeResourceId: string) => createFromBuilder(scopeResourceId),
  fromElement: <TElement = Element>(element: TElement, resourceId?: string) =>
    createExternalBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >(HTML_ELEMENT_EVENT_HELPERS, element, resourceId),
  history: (resourceId = "history") => createHistoryBuilder(resourceId),
  getElementById: <TElement extends Element = Element>(
    id: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [id],
      method: "getElementById",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  getElementsByClassName: <TElement extends Element = Element>(
    className: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [className],
      method: "getElementsByClassName",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  getElementsByName: <TElement extends Element = Element>(
    name: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [name],
      method: "getElementsByName",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  getElementsByTagName: <TElement extends Element = Element>(
    tagName: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [tagName],
      method: "getElementsByTagName",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  location: (resourceId = "location") => createLocationBuilder(resourceId),
  input: (selector: string, resourceId?: string) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      HTMLInputElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  select: (selector: string, resourceId?: string) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      HTMLSelectElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  textarea: (selector: string, resourceId?: string) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      HTMLTextAreaElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  querySelector: <TElement extends Element = Element>(
    selector: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  querySelectorAll: <TElement extends Element = Element>(
    selector: string,
    resourceId?: string,
  ) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelectorAll",
      resourceId,
    }) as unknown as TargetBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >,
  visualViewport: (resourceId = "visualViewport") =>
    createSingletonBuilder<
      VisualViewportEventMap,
      VisualViewport,
      typeof VISUAL_VIEWPORT_EVENT_HELPERS
    >(VISUAL_VIEWPORT_EVENT_HELPERS, "visualViewport", resourceId),
  window: (resourceId = "window") =>
    createSingletonBuilder<
      WindowEventMap,
      Window & typeof globalThis,
      typeof WINDOW_EVENT_HELPERS
    >(WINDOW_EVENT_HELPERS, "window", resourceId),
}
