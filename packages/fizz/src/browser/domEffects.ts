import type { Action } from "../action.js"
import { Effect, effect } from "../effect.js"

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

export type DomListenOptions = (AddEventListenerOptions | boolean) & {
  coalesce?: DomListenCoalesceMode
}

type TargetBuilder<
  EventMap extends EventMapLike,
  TElement = unknown,
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
}

type HistoryEventMap = { popstate: PopStateEvent }
type LocationEventMap = { hashchange: HashChangeEvent }

type HistoryBuilder = Effect<DomAcquireEffectData> &
  Pick<
    TargetBuilder<HistoryEventMap, History>,
    "listen" | "mutate" | "resource"
  >
type LocationBuilder = Effect<DomAcquireEffectData> &
  Pick<
    TargetBuilder<LocationEventMap, Location>,
    "listen" | "mutate" | "resource"
  >

type DomFromBuilder = {
  closest: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<HTMLElementEventMap>
  getElementById: (
    resourceId: string,
    id: string,
  ) => TargetBuilder<HTMLElementEventMap>
  getElementsByClassName: (
    resourceId: string,
    className: string,
  ) => TargetBuilder<HTMLElementEventMap>
  getElementsByName: (
    resourceId: string,
    name: string,
  ) => TargetBuilder<HTMLElementEventMap>
  getElementsByTagName: (
    resourceId: string,
    tagName: string,
  ) => TargetBuilder<HTMLElementEventMap>
  querySelector: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<HTMLElementEventMap>
  querySelectorAll: (
    resourceId: string,
    selector: string,
  ) => TargetBuilder<HTMLElementEventMap>
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
>(options: {
  acquire: DomAcquireEffectData
  resourceId: string
}): TargetBuilder<EventMap, TElement> => {
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
      const { coalesce, ...restOptions } =
        eventOptions !== undefined && typeof eventOptions === "object"
          ? eventOptions
          : ({} as DomListenOptions)

      const hasListenerOptions =
        eventOptions !== undefined &&
        (typeof eventOptions !== "object" || Object.keys(restOptions).length > 0)

      return [
        builder,
        domListen({
          ...(coalesce !== undefined ? { coalesce } : {}),
          ...(hasListenerOptions
            ? {
                options:
                  typeof eventOptions === "object" ? restOptions : eventOptions,
              }
            : {}),
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
  }) as unknown as TargetBuilder<EventMap, TElement>

  return builder
}

const createSingletonBuilder = <
  EventMap extends EventMapLike,
  TElement = unknown,
>(
  target: DomSingletonTarget,
  resourceId: string,
): TargetBuilder<EventMap, TElement> =>
  createTargetBuilder<EventMap, TElement>({
    acquire: {
      kind: "singleton",
      resourceId,
      target,
    },
    resourceId,
  })

const createExternalBuilder = <
  EventMap extends EventMapLike,
  TElement = unknown,
>(
  resourceId: string,
  element: TElement,
): TargetBuilder<EventMap, TElement> =>
  createTargetBuilder<EventMap, TElement>({
    acquire: {
      element,
      kind: "external",
      resourceId,
    },
    resourceId,
  })

const createHistoryBuilder = (resourceId: string): HistoryBuilder => {
  const builder = createSingletonBuilder<HistoryEventMap, History>(
    "history",
    resourceId,
  )

  return builder
}

const createLocationBuilder = (resourceId: string): LocationBuilder => {
  const builder = createSingletonBuilder<LocationEventMap, Location>(
    "location",
    resourceId,
  )

  return builder
}

const createQueryBuilder = (options: {
  args: string[]
  method: DomQueryMethod
  resourceId: string
  scopeResourceId?: string
}): TargetBuilder<HTMLElementEventMap, Element> =>
  createTargetBuilder<HTMLElementEventMap, Element>({
    acquire: {
      args: options.args,
      kind: "query",
      method: options.method,
      resourceId: options.resourceId,
      ...(options.scopeResourceId === undefined
        ? {}
        : { scopeResourceId: options.scopeResourceId }),
    },
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
    createSingletonBuilder<HTMLElementEventMap, Element>(
      "activeElement",
      resourceId,
    ),
  body: (resourceId = "body") =>
    createSingletonBuilder<HTMLElementEventMap, HTMLBodyElement>(
      "body",
      resourceId,
    ),
  closest: (resourceId: string, sourceResourceId: string, selector: string) =>
    createQueryBuilder({
      args: [selector],
      method: "closest",
      resourceId,
      scopeResourceId: sourceResourceId,
    }),
  document: (resourceId = "document") =>
    createSingletonBuilder<DocumentEventMap, Document>("document", resourceId),
  documentElement: (resourceId = "documentElement") =>
    createSingletonBuilder<HTMLElementEventMap, HTMLHtmlElement>(
      "documentElement",
      resourceId,
    ),
  from: (scopeResourceId: string) => createFromBuilder(scopeResourceId),
  fromElement: <TElement = Element>(resourceId: string, element: TElement) =>
    createExternalBuilder<HTMLElementEventMap, TElement>(resourceId, element),
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
    createSingletonBuilder<VisualViewportEventMap, VisualViewport>(
      "visualViewport",
      resourceId,
    ),
  window: (resourceId = "window") =>
    createSingletonBuilder<WindowEventMap, Window & typeof globalThis>(
      "window",
      resourceId,
    ),
}
