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

export type DomListenEffectData = {
  coalesce?: DomListenCoalesceMode
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
  targetResourceId: string
}

export type DomListenOptions =
  | boolean
  | (AddEventListenerOptions & { coalesce?: DomListenCoalesceMode })

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

type TargetBuilder<
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
> = Effect<DomAcquireEffectData> & {
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
  closest: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementById: (
    resourceId: string,
    id: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByClassName: (
    resourceId: string,
    className: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByName: (
    resourceId: string,
    name: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  getElementsByTagName: (
    resourceId: string,
    tagName: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  querySelector: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
  querySelectorAll: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >
}

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

const parseListenOptions = (eventOptions?: DomListenOptions) => {
  let coalesce: DomListenCoalesceMode | undefined
  let listenerOptions: AddEventListenerOptions | boolean | undefined

  if (typeof eventOptions === "boolean") {
    listenerOptions = eventOptions
  } else if (eventOptions !== undefined) {
    const { coalesce: parsedCoalesce, ...restOptions } = eventOptions

    coalesce = parsedCoalesce

    if (Object.keys(restOptions).length > 0) {
      listenerOptions = restOptions
    }
  }

  return {
    coalesce,
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
    mutate: (fn: (element: TElement) => void) => [
      builder,
      domMutate({
        fn: fn as (element: unknown) => void,
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
        const { coalesce, listenerOptions } = parseListenOptions(listenOptions)

        return [
          builder,
          domListen({
            ...(coalesce === undefined ? {} : { coalesce }),
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
  resourceId: string,
  element: TElement,
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
  resourceId: string
  scopeResourceId?: string
}): TargetBuilder<
  HTMLElementEventMap,
  Element,
  typeof HTML_ELEMENT_EVENT_HELPERS
> =>
  createTargetBuilder<
    HTMLElementEventMap,
    Element,
    typeof HTML_ELEMENT_EVENT_HELPERS
  >({
    acquire: {
      args: options.args,
      kind: "query",
      method: options.method,
      resourceId: options.resourceId,
      ...(options.scopeResourceId === undefined
        ? {}
        : { scopeResourceId: options.scopeResourceId }),
    },
    eventHelpers: HTML_ELEMENT_EVENT_HELPERS,
    resourceId: options.resourceId,
  })

const createFromBuilder = (scopeResourceId: string): DomFromBuilder => ({
  closest: (resourceId, selector) =>
    createQueryBuilder({
      args: [selector],
      method: "closest",
      resourceId,
      scopeResourceId,
    }),
  getElementById: (resourceId, id) =>
    createQueryBuilder({
      args: [id],
      method: "getElementById",
      resourceId,
      scopeResourceId,
    }),
  getElementsByClassName: (resourceId, className) =>
    createQueryBuilder({
      args: [className],
      method: "getElementsByClassName",
      resourceId,
      scopeResourceId,
    }),
  getElementsByName: (resourceId, name) =>
    createQueryBuilder({
      args: [name],
      method: "getElementsByName",
      resourceId,
      scopeResourceId,
    }),
  getElementsByTagName: (resourceId, tagName) =>
    createQueryBuilder({
      args: [tagName],
      method: "getElementsByTagName",
      resourceId,
      scopeResourceId,
    }),
  querySelector: (resourceId, selector) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
      scopeResourceId,
    }),
  querySelectorAll: (resourceId, selector) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelectorAll",
      resourceId,
      scopeResourceId,
    }),
})

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
  closest: (resourceId: string, sourceResourceId: string, selector: string) =>
    createQueryBuilder({
      args: [selector],
      method: "closest",
      resourceId,
      scopeResourceId: sourceResourceId,
    }),
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
  fromElement: <TElement = Element>(resourceId: string, element: TElement) =>
    createExternalBuilder<
      HTMLElementEventMap,
      TElement,
      typeof HTML_ELEMENT_EVENT_HELPERS
    >(HTML_ELEMENT_EVENT_HELPERS, resourceId, element),
  history: (resourceId = "history") => createHistoryBuilder(resourceId),
  getElementById: (resourceId: string, id: string) =>
    createQueryBuilder({
      args: [id],
      method: "getElementById",
      resourceId,
    }),
  getElementsByClassName: (resourceId: string, className: string) =>
    createQueryBuilder({
      args: [className],
      method: "getElementsByClassName",
      resourceId,
    }),
  getElementsByName: (resourceId: string, name: string) =>
    createQueryBuilder({
      args: [name],
      method: "getElementsByName",
      resourceId,
    }),
  getElementsByTagName: (resourceId: string, tagName: string) =>
    createQueryBuilder({
      args: [tagName],
      method: "getElementsByTagName",
      resourceId,
    }),
  location: (resourceId = "location") => createLocationBuilder(resourceId),
  querySelector: (resourceId: string, selector: string) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelector",
      resourceId,
    }),
  querySelectorAll: (resourceId: string, selector: string) =>
    createQueryBuilder({
      args: [selector],
      method: "querySelectorAll",
      resourceId,
    }),
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
