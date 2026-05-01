export type BrowserConfirmResult = "accept" | "reject" | boolean

export type RuntimeDomAcquireQueryMethod =
  | "closest"
  | "getElementById"
  | "getElementsByClassName"
  | "getElementsByName"
  | "getElementsByTagName"
  | "querySelector"
  | "querySelectorAll"

export type RuntimeDomAcquireSingletonTarget =
  | "activeElement"
  | "body"
  | "document"
  | "documentElement"
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
  locationAssign?: (url: string) => void | Promise<void>
  locationReload?: () => void | Promise<void>
  locationReplace?: (url: string) => void | Promise<void>
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
  visualViewport?: () => VisualViewport | null
  window?: () => Window | null
}

export type RuntimeBrowserDriver = RuntimeBrowserEffectDriver & RuntimeDomDriver
