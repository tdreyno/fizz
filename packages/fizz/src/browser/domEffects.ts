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

type AnyAction = Action<string, unknown>
type EventMapLike = object

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

type FluentDomListenBuilder<TEvent extends Event, TMapped = TEvent> = {
  mapEvent: <TNext>(
    mapper: (value: TMapped) => TNext,
  ) => FluentDomListenBuilder<TEvent, TNext>
  matchesKey: (
    matcher: KeyMatcher | string,
  ) => FluentDomListenBuilder<TEvent, TMapped>
  noModifiers: () => FluentDomListenBuilder<TEvent, TMapped>
  matchesKeyCombo: (
    matcher: KeyMatcher,
  ) => FluentDomListenBuilder<TEvent, TMapped>
  once: () => FluentDomListenBuilder<TEvent, TMapped>
  onlyPrimaryButton: () => FluentDomListenBuilder<TEvent, TMapped>
  preventDefault: () => FluentDomListenBuilder<TEvent, TMapped>
  stopPropagation: () => FluentDomListenBuilder<TEvent, TMapped>
  when: (
    predicate: (event: TEvent, value: TMapped) => boolean,
  ) => FluentDomListenBuilder<TEvent, TMapped>
  withKeyRepeat: () => FluentDomListenBuilder<TEvent, TMapped>
  withoutKeyRepeat: () => FluentDomListenBuilder<TEvent, TMapped>
  chainToAction: (
    onMatch: FluentActionMapper<TMapped>,
    onNoMatch?: FluentActionMapper<TEvent>,
  ) => Effect<unknown>[]
}

type DomEventHelperOverload<
  EventType extends string,
  EventMap extends EventMapLike,
> = {
  (
    toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
    options?: DomListenOptions,
  ): Effect<unknown>[]
  (
    options?: DomListenOptions,
  ): FluentDomListenBuilder<EventFromMap<EventMap, EventType>>
}

type TargetBuilderListenHelpers<
  EventMap extends EventMapLike,
  EventHelpers extends DomEventHelperMap<EventMap>,
> = {
  [EventType in keyof EventHelpers &
    string as EventHelpers[EventType]]: DomEventHelperOverload<
    EventType,
    EventMap
  >
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

type CallMethodHelper<TElement> = <TName extends MethodNameOrString<TElement>>(
  name: TName,
  ...args: MethodArgsOf<TElement, TName>
) => Effect<unknown>[]

type ApplyMethodHelper<TElement> = <TName extends MethodNameOrString<TElement>>(
  name: TName,
  args: MethodArgsOf<TElement, TName>,
) => Effect<unknown>[]

type PropertyNameOrString<T> = T extends object
  ? [keyof T & string] extends [never]
    ? string
    : keyof T & string
  : string

type SetPropertyHelper<TElement> = <
  TName extends PropertyNameOrString<TElement>,
>(
  name: TName,
  value: TName extends keyof TElement ? TElement[TName] : unknown,
) => Effect<unknown>[]

type TargetBuilder<
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
> = Effect<DomAcquireEffectData> & {
  appendChildren: (...children: Node[]) => Effect<unknown>[]
  applyMethod: ApplyMethodHelper<TElement>
  callMethod: CallMethodHelper<TElement>
  clearChildren: () => Effect<unknown>[]
  classList: (ops: ClassListOperations) => Effect<unknown>[]
  classListSet: (classes: readonly string[]) => Effect<unknown>[]
  dispatchEvent: {
    (
      type: string,
      init?: EventInit | CustomEventInit<unknown>,
    ): Effect<unknown>[]
    (event: Event): Effect<unknown>[]
  }
  listen: {
    <EventType extends string>(
      type: EventType,
      toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
      options?: DomListenOptions,
    ): Effect<unknown>[]
    <EventType extends string>(
      type: EventType,
      options?: DomListenOptions,
    ): FluentDomListenBuilder<EventFromMap<EventMap, EventType>>
  }
  mutate: (fn: (element: TElement) => void) => Effect<unknown>[]
  ownerDocument: () => TargetBuilder<
    DocumentEventMap,
    Document,
    typeof DOCUMENT_EVENT_HELPERS
  >
  prependChildren: (...children: Node[]) => Effect<unknown>[]
  replaceChildren: (...children: Node[]) => Effect<unknown>[]
  setAttribute: (name: string, value: string) => Effect<unknown>[]
  setChecked: (checked: boolean) => Effect<unknown>[]
  setInnerHTML: (html: string) => Effect<unknown>[]
  setProperty: SetPropertyHelper<TElement>
  setSelectionRange: (
    start: number,
    end: number,
    direction?: SelectionDirection,
  ) => Effect<unknown>[]
  setText: (text: string) => Effect<unknown>[]
  setValue: (value: string) => Effect<unknown>[]
  observeIntersection: {
    (
      toAction: (
        entries: IntersectionObserverEntry[],
        observer: IntersectionObserver,
      ) => AnyAction,
      options?: IntersectionObserverInit,
    ): Effect<unknown>[]
    (
      observerId: string,
      toAction: (
        entries: IntersectionObserverEntry[],
        observer: IntersectionObserver,
      ) => AnyAction,
      options?: IntersectionObserverInit,
    ): Effect<unknown>[]
  }
  observeResize: {
    (
      toAction: (
        entries: ResizeObserverEntry[],
        observer: ResizeObserver,
      ) => AnyAction,
      options?: ResizeObserverOptions,
    ): Effect<unknown>[]
    (
      observerId: string,
      toAction: (
        entries: ResizeObserverEntry[],
        observer: ResizeObserver,
      ) => AnyAction,
      options?: ResizeObserverOptions,
    ): Effect<unknown>[]
  }
  resource: () => Effect<unknown>
} & TargetBuilderListenHelpers<EventMap, EventHelpers>

type HistoryEventMap = { popstate: PopStateEvent }
type LocationEventMap = { hashchange: HashChangeEvent }

type HistoryBuilder = Effect<DomAcquireEffectData> &
  Pick<
    TargetBuilder<HistoryEventMap, History, typeof HISTORY_EVENT_HELPERS>,
    "listen" | "mutate" | "resource"
  > &
  TargetBuilderListenHelpers<HistoryEventMap, typeof HISTORY_EVENT_HELPERS>
type LocationBuilder = Effect<DomAcquireEffectData> &
  Pick<
    TargetBuilder<LocationEventMap, Location, typeof LOCATION_EVENT_HELPERS>,
    "listen" | "mutate" | "resource"
  > &
  TargetBuilderListenHelpers<LocationEventMap, typeof LOCATION_EVENT_HELPERS>

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
  direction?: SelectionDirection,
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
        direction: SelectionDirection,
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

    const event = hasDetail
      ? new CustomEvent(typeOrEvent, eventInit)
      : new Event(typeOrEvent, eventInit)

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

const isOutsideTarget = (options: {
  event: Event
  includeTrigger?: Element | null
  inside: Array<Element | null | undefined>
}): boolean => {
  const target = options.event.target

  if (!isDomNode(target)) {
    return false
  }

  if (containsTargetNode(options.includeTrigger, target)) {
    return false
  }

  return options.inside
    .filter(Boolean)
    .every(element => !element?.contains(target))
}

const createFluentListenBuilder = <
  TEvent extends Event,
  TMapped = TEvent,
>(options: {
  mapFromEvent?: (event: TEvent) => TMapped
  onNoMatch?: (event: TEvent) => AnyAction | undefined
  predicates?: Array<(event: TEvent, value: TMapped) => boolean>
  runEffects: (
    toAction: (event: Event) => AnyAction | undefined,
  ) => Effect<unknown>[]
  runPreventDefault?: boolean
  runStopPropagation?: boolean
  runOnce?: boolean
}): FluentDomListenBuilder<TEvent, TMapped> => {
  const mapFromEvent =
    options.mapFromEvent ?? ((event: TEvent) => event as unknown as TMapped)
  const predicates = options.predicates ?? []

  const createNext = <TNext>(next: {
    mapFromEvent?: (event: TEvent) => TNext
    onNoMatch?: (event: TEvent) => AnyAction | undefined
    predicates?: Array<(event: TEvent, value: TNext) => boolean>
    runOnce?: boolean
    runPreventDefault?: boolean
    runStopPropagation?: boolean
  }) =>
    createFluentListenBuilder<TEvent, TNext>({
      mapFromEvent:
        next.mapFromEvent ??
        ((event: TEvent) => mapFromEvent(event) as unknown as TNext),
      onNoMatch: next.onNoMatch ?? options.onNoMatch,
      predicates:
        next.predicates ??
        (predicates as Array<(event: TEvent, value: TNext) => boolean>),
      runEffects: options.runEffects,
      runOnce: next.runOnce ?? options.runOnce,
      runPreventDefault: next.runPreventDefault ?? options.runPreventDefault,
      runStopPropagation: next.runStopPropagation ?? options.runStopPropagation,
    })

  return {
    mapEvent: mapper =>
      createNext({
        mapFromEvent: (event: TEvent) => mapper(mapFromEvent(event)),
      }),
    noModifiers: () =>
      createNext({
        predicates: [...predicates, (event: TEvent) => hasNoModifiers(event)],
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
        predicates: [...predicates, predicate],
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
    chainToAction: (onMatch, onNoMatch) => {
      let hasTriggered = false

      return options.runEffects((event: Event) => {
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
        const passed = predicates.every(predicate =>
          predicate(typedEvent, value),
        )

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
      })
    },
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
  const builder = Object.assign(domAcquire(options.acquire), {
    appendChildren: (...children: Node[]) => [
      builder,
      domMutate({
        fn: element => appendChildrenOnTarget(element, children),
        label: "appendChildren",
        targetResourceId: options.resourceId,
      }),
    ],
    applyMethod: (name: string, args: readonly unknown[] = []) => [
      builder,
      domMutate({
        fn: element => invokeMethod(element, name, args),
        label: `applyMethod(${name})`,
        targetResourceId: options.resourceId,
      }),
    ],
    callMethod: (name: string, ...args: readonly unknown[]) => [
      builder,
      domMutate({
        fn: element => invokeMethod(element, name, args),
        label: `callMethod(${name})`,
        targetResourceId: options.resourceId,
      }),
    ],
    clearChildren: () => [
      builder,
      domMutate({
        fn: element => replaceChildrenOnTarget(element, []),
        label: "clearChildren",
        targetResourceId: options.resourceId,
      }),
    ],
    classList: (ops: ClassListOperations) => [
      builder,
      domMutate({
        fn: element => applyClassListOps(element, ops),
        label: formatClassListLabel(ops),
        targetResourceId: options.resourceId,
      }),
    ],
    classListSet: (classes: readonly string[]) => [
      builder,
      domMutate({
        fn: element => applyClassListSet(element, classes),
        label: `classListSet(${classes.join(" ")})`,
        targetResourceId: options.resourceId,
      }),
    ],
    dispatchEvent: (
      typeOrEvent: string | Event,
      init?: EventInit | CustomEventInit<unknown>,
    ) => [
      builder,
      domMutate({
        fn: element => dispatchEventOnTarget(element, typeOrEvent, init),
        label:
          typeof typeOrEvent === "string"
            ? `dispatchEvent(${typeOrEvent})`
            : `dispatchEvent(${typeOrEvent.type})`,
        targetResourceId: options.resourceId,
      }),
    ],
    mutate: (fn: (element: TElement) => void) => [
      builder,
      domMutate({
        fn: fn as (element: unknown) => void,
        targetResourceId: options.resourceId,
      }),
    ],
    ownerDocument: () => {
      const resourceId = autoQueryResourceId(
        "ownerDocument",
        options.resourceId,
      )

      return createTargetBuilder<
        DocumentEventMap,
        Document,
        typeof DOCUMENT_EVENT_HELPERS
      >({
        acquire: {
          args: [],
          kind: "query",
          method: "ownerDocument",
          resourceId,
          scopeResourceId: options.resourceId,
        },
        eventHelpers: DOCUMENT_EVENT_HELPERS,
        resourceId,
      })
    },
    prependChildren: (...children: Node[]) => [
      builder,
      domMutate({
        fn: element => prependChildrenOnTarget(element, children),
        label: "prependChildren",
        targetResourceId: options.resourceId,
      }),
    ],
    replaceChildren: (...children: Node[]) => [
      builder,
      domMutate({
        fn: element => replaceChildrenOnTarget(element, children),
        label: "replaceChildren",
        targetResourceId: options.resourceId,
      }),
    ],
    setAttribute: (name: string, value: string) => [
      builder,
      domMutate({
        fn: element => setAttributeOnTarget(element, name, value),
        label: `setAttribute(${name})`,
        targetResourceId: options.resourceId,
      }),
    ],
    setChecked: (checked: boolean) => [
      builder,
      domMutate({
        fn: element => setCheckedOnTarget(element, checked),
        label: `setChecked(${checked ? "true" : "false"})`,
        targetResourceId: options.resourceId,
      }),
    ],
    setInnerHTML: (html: string) => [
      builder,
      domMutate({
        fn: element => setInnerHTMLOnTarget(element, html),
        label: "setInnerHTML",
        targetResourceId: options.resourceId,
      }),
    ],
    setProperty: (name: string, value: unknown) => [
      builder,
      domMutate({
        fn: element => setPropertyOnTarget(element, name, value),
        label: `setProperty(${name})`,
        targetResourceId: options.resourceId,
      }),
    ],
    setSelectionRange: (
      start: number,
      end: number,
      direction?: SelectionDirection,
    ) => [
      builder,
      domMutate({
        fn: element =>
          setSelectionRangeOnTarget(element, start, end, direction),
        label:
          direction === undefined
            ? `setSelectionRange(${start},${end})`
            : `setSelectionRange(${start},${end},${direction})`,
        targetResourceId: options.resourceId,
      }),
    ],
    setText: (text: string) => [
      builder,
      domMutate({
        fn: element => setTextOnTarget(element, text),
        label: "setText",
        targetResourceId: options.resourceId,
      }),
    ],
    setValue: (value: string) => [
      builder,
      domMutate({
        fn: element => setValueOnTarget(element, value),
        label: "setValue",
        targetResourceId: options.resourceId,
      }),
    ],
    listen: (
      type: string,
      toActionOrOptions?: ((event: Event) => AnyAction) | DomListenOptions,
      eventOptions?: DomListenOptions,
    ) => {
      const createEffects = (
        toAction: (event: Event) => AnyAction | undefined,
        listenOptions?: DomListenOptions,
      ) => {
        const { coalesce, listenerOptions, order } =
          parseListenOptions(listenOptions)

        return [
          builder,
          domListen({
            ...(coalesce === undefined ? {} : { coalesce }),
            ...(order === undefined ? {} : { order }),
            ...(listenerOptions === undefined
              ? {}
              : { options: listenerOptions }),
            targetResourceId: options.resourceId,
            toAction,
            type,
          }),
        ]
      }

      if (typeof toActionOrOptions === "function") {
        return createEffects(toActionOrOptions, eventOptions)
      }

      return createFluentListenBuilder({
        runEffects: toAction => createEffects(toAction, toActionOrOptions),
      })
    },
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

      return [
        builder,
        domObserveIntersection({
          ...(observerId === undefined ? {} : { observerId }),
          ...(observerOptions === undefined
            ? {}
            : { options: observerOptions }),
          targetResourceId: options.resourceId,
          toAction,
        }),
      ]
    },
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

      return [
        builder,
        domObserveResize({
          ...(observerId === undefined ? {} : { observerId }),
          ...(observerOptions === undefined
            ? {}
            : { options: observerOptions }),
          targetResourceId: options.resourceId,
          toAction,
        }),
      ]
    },
    resource: () => builder,
  }) as unknown as TargetBuilder<EventMap, TElement, EventHelpers>

  for (const [type, helperName] of Object.entries(options.eventHelpers)) {
    const target = builder as unknown as Record<string, unknown>

    target[helperName] = (
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

const createQueryBuilder = (options: {
  args: string[]
  method: DomQueryMethod
  resourceId: string | undefined
  scopeResourceId?: string
}): TargetBuilder<
  HTMLElementEventMap,
  Element,
  typeof HTML_ELEMENT_EVENT_HELPERS
> => {
  const resourceId =
    options.resourceId ??
    autoQueryResourceId(options.method, options.args[0] ?? "")

  return createTargetBuilder<
    HTMLElementEventMap,
    Element,
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

const createFromBuilder = (scopeResourceId: string): DomFromBuilder => {
  const queryBuilder = (
    method: DomQueryMethod,
    args: string[],
    resourceId: string | undefined,
  ) =>
    createQueryBuilder({
      args,
      method,
      resourceId,
      scopeResourceId,
    })

  return {
    closest: ((selector, resourceId) =>
      queryBuilder(
        "closest",
        [selector],
        resourceId,
      )) as DomFromBuilder["closest"],
    getElementById: ((id, resourceId) =>
      queryBuilder(
        "getElementById",
        [id],
        resourceId,
      )) as DomFromBuilder["getElementById"],
    getElementsByClassName: ((className, resourceId) =>
      queryBuilder(
        "getElementsByClassName",
        [className],
        resourceId,
      )) as DomFromBuilder["getElementsByClassName"],
    getElementsByName: ((name, resourceId) =>
      queryBuilder(
        "getElementsByName",
        [name],
        resourceId,
      )) as DomFromBuilder["getElementsByName"],
    getElementsByTagName: ((tagName, resourceId) =>
      queryBuilder(
        "getElementsByTagName",
        [tagName],
        resourceId,
      )) as DomFromBuilder["getElementsByTagName"],
    querySelector: ((selector, resourceId) =>
      queryBuilder(
        "querySelector",
        [selector],
        resourceId,
      )) as DomFromBuilder["querySelector"],
    querySelectorAll: ((selector, resourceId) =>
      queryBuilder(
        "querySelectorAll",
        [selector],
        resourceId,
      )) as DomFromBuilder["querySelectorAll"],
    input: ((selector: string, resourceId?: string) =>
      queryBuilder(
        "querySelector",
        [selector],
        resourceId,
      )) as unknown as DomFromBuilder["input"],
    select: ((selector: string, resourceId?: string) =>
      queryBuilder(
        "querySelector",
        [selector],
        resourceId,
      )) as unknown as DomFromBuilder["select"],
    textarea: ((selector: string, resourceId?: string) =>
      queryBuilder(
        "querySelector",
        [selector],
        resourceId,
      )) as unknown as DomFromBuilder["textarea"],
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
