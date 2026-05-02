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
  toAction: (event: Event) => AnyAction
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

type TargetBuilderListenHelpers<
  EventMap extends EventMapLike,
  EventHelpers extends DomEventHelperMap<EventMap>,
> = {
  [EventType in keyof EventHelpers & string as EventHelpers[EventType]]: (
    toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
    options?: DomListenOptions,
  ) => Effect<unknown>[]
}

type TargetBuilder<
  EventMap extends EventMapLike,
  TElement = unknown,
  EventHelpers extends DomEventHelperMap<EventMap> =
    DomEventHelperMap<EventMap>,
> = Effect<DomAcquireEffectData> & {
  listen: <EventType extends string>(
    type: EventType,
    toAction: (event: EventFromMap<EventMap, EventType>) => AnyAction,
    options?: DomListenOptions,
  ) => Effect<unknown>[]
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
      toAction: (event: Event) => AnyAction,
      eventOptions?: DomListenOptions,
    ) => {
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
      toAction: (event: Event) => AnyAction,
      eventOptions?: DomListenOptions,
    ) => builder.listen(type, toAction, eventOptions)
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
