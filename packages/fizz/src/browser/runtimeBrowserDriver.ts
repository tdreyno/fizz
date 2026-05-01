export type BrowserConfirmResult = "accept" | "reject" | boolean

export type RuntimeDomAcquireQueryMethod =
  | "closest"
  | "getElementById"
  | "getElementsByClassName"
  | "getElementsByName"
  | "getElementsByTagName"
  | "querySelector"
  | "querySelectorAll"

export type RuntimeHistoryTarget = EventTarget & {
  readonly length: number
  readonly scrollRestoration: ScrollRestoration
  readonly state: unknown
}

export type RuntimeLocationTarget = EventTarget & {
  readonly hash: string
  readonly host: string
  readonly hostname: string
  readonly href: string
  readonly origin: string
  readonly pathname: string
  readonly port: string
  readonly protocol: string
  readonly search: string
}

export type RuntimeDomAcquireSingletonTarget =
  | "activeElement"
  | "body"
  | "document"
  | "documentElement"
  | "history"
  | "location"
  | "visualViewport"
  | "window"

type RuntimeBrowserEffectDriver = {
  alert?: (message: string) => void | Promise<void>
  confirm?: (
    message: string,
  ) => BrowserConfirmResult | Promise<BrowserConfirmResult>
  copyToClipboard?: (text: string) => void | Promise<void>
  historyBack?: () => void | Promise<void>
  historyForward?: () => void | Promise<void>
  historyGo?: (delta: number) => void | Promise<void>
  historyPushState?: (state: unknown, url?: string) => void | Promise<void>
  historyReplaceState?: (state: unknown, url?: string) => void | Promise<void>
  historySetScrollRestoration?: (
    value: ScrollRestoration,
  ) => void | Promise<void>
  locationAssign?: (url: string) => void | Promise<void>
  locationReload?: () => void | Promise<void>
  locationReplace?: (url: string) => void | Promise<void>
  locationSetHash?: (hash: string) => void | Promise<void>
  locationSetHost?: (host: string) => void | Promise<void>
  locationSetHostname?: (hostname: string) => void | Promise<void>
  locationSetHref?: (href: string) => void | Promise<void>
  locationSetPathname?: (pathname: string) => void | Promise<void>
  locationSetPort?: (port: string) => void | Promise<void>
  locationSetProtocol?: (protocol: string) => void | Promise<void>
  locationSetSearch?: (search: string) => void | Promise<void>
  openUrl?: (
    url: string,
    target?: string,
    features?: string,
  ) => void | Promise<void>
  postMessage?: (
    message: unknown,
    targetOrigin: string,
    transfer?: Transferable[],
  ) => void | Promise<void>
  printPage?: () => void | Promise<void>
  prompt?: (message: string) => string | null | Promise<string | null>
}

export type RuntimeDomDriver = {
  activeElement?: () => Element | null
  addEventListener?: (
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) => void
  body?: () => HTMLElement | null
  closest?: (target: Element, selector: string) => Element | null
  createIntersectionObserver?: (
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) => IntersectionObserver
  createResizeObserver?: (
    callback: ResizeObserverCallback,
    options?: ResizeObserverOptions,
  ) => ResizeObserver
  document?: () => Document | null
  documentElement?: () => HTMLElement | null
  getElementById?: (id: string, scope?: Document | Element) => Element | null
  getElementsByClassName?: (
    className: string,
    scope?: Document | Element,
  ) => Element[]
  getElementsByName?: (name: string, scope?: Document | Element) => Element[]
  getElementsByTagName?: (
    tagName: string,
    scope?: Document | Element,
  ) => Element[]
  querySelector?: (
    selector: string,
    scope?: Document | Element,
  ) => Element | null
  querySelectorAll?: (selector: string, scope?: Document | Element) => Element[]
  removeEventListener?: (
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) => void
  history?: () => RuntimeHistoryTarget | null
  location?: () => RuntimeLocationTarget | null
  visualViewport?: () => VisualViewport | null
  window?: () => Window | null
}

export type RuntimeBrowserDriver = RuntimeBrowserEffectDriver & RuntimeDomDriver
