import type {
  RuntimeDomDriver,
  RuntimeHistoryTarget,
  RuntimeLocationTarget,
} from "../runtimeBrowserDriver"

type EventListenerSet = Set<EventListener>

export class MockEventTarget implements EventTarget {
  readonly #listeners = new Map<string, EventListenerSet>()

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
  ) {
    if (!callback) {
      return
    }

    const listener =
      typeof callback === "function"
        ? callback
        : (event: Event) => callback.handleEvent(event)
    const current = this.#listeners.get(type)

    if (current) {
      current.add(listener)

      return
    }

    this.#listeners.set(type, new Set([listener]))
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
  ) {
    if (!callback) {
      return
    }

    const listener =
      typeof callback === "function"
        ? callback
        : (event: Event) => callback.handleEvent(event)

    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.#listeners.get(event.type)

    if (!listeners) {
      return true
    }

    listeners.forEach(listener => {
      listener(event)
    })

    return !event.defaultPrevented
  }

  emit(type: string, event?: Event): void {
    const nextEvent = event ?? new Event(type)

    this.dispatchEvent(nextEvent)
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0
  }
}

export class MockElementTarget
  extends MockEventTarget
  implements Pick<Element, "closest" | "nodeType">
{
  readonly closestResults = new Map<string, Element | null>()
  readonly nodeType = 1

  closest(selector: string): Element | null {
    return this.closestResults.get(selector) ?? null
  }
}

export class MockHistoryTarget
  extends MockEventTarget
  implements RuntimeHistoryTarget
{
  length = 1
  scrollRestoration: ScrollRestoration = "auto"
  state: unknown = null
}

export class MockLocationTarget
  extends MockEventTarget
  implements RuntimeLocationTarget
{
  hash = ""
  host = "localhost"
  hostname = "localhost"
  href = "http://localhost/"
  origin = "http://localhost"
  pathname = "/"
  port = ""
  protocol = "http:"
  search = ""
}

type MockIntersectionObserverRecord = {
  callback: IntersectionObserverCallback
  disconnectCalls: number
  observeCalls: Element[]
  observer: IntersectionObserver
}

type MockResizeObserverRecord = {
  callback: ResizeObserverCallback
  disconnectCalls: number
  observeCalls: Array<{
    options: ResizeObserverOptions | undefined
    target: Element
  }>
  observer: ResizeObserver
}

const createIntersectionObserverRecord = (
  callback: IntersectionObserverCallback,
): MockIntersectionObserverRecord => {
  const record: MockIntersectionObserverRecord = {
    callback,
    disconnectCalls: 0,
    observeCalls: [],
    observer: {
      disconnect: () => {
        record.disconnectCalls += 1
      },
      observe: (target: Element) => {
        record.observeCalls.push(target)
      },
      root: null,
      rootMargin: "",
      scrollMargin: "",
      takeRecords: () => [],
      thresholds: [],
      unobserve: () => {
        // no-op in tests
      },
    } as unknown as IntersectionObserver,
  }

  return record
}

const createResizeObserverRecord = (
  callback: ResizeObserverCallback,
): MockResizeObserverRecord => {
  const record: MockResizeObserverRecord = {
    callback,
    disconnectCalls: 0,
    observeCalls: [],
    observer: {
      disconnect: () => {
        record.disconnectCalls += 1
      },
      observe: (target: Element, options?: ResizeObserverOptions) => {
        record.observeCalls.push({ options, target })
      },
      unobserve: () => {
        // no-op in tests
      },
    } as ResizeObserver,
  }

  return record
}

export const createMockDomDriver = (): {
  driver: RuntimeDomDriver
  emit: {
    activeElement: MockEventTarget
    body: MockEventTarget
    document: MockEventTarget
    documentElement: MockEventTarget
    history: MockHistoryTarget
    location: MockLocationTarget
    visualViewport: MockEventTarget
    window: MockEventTarget
  }
  intersectionObservers: MockIntersectionObserverRecord[]
  query: {
    byClassName: Map<string, Element[]>
    byId: Map<string, Element | null>
    byName: Map<string, Element[]>
    bySelector: Map<string, Element | null>
    bySelectorAll: Map<string, Element[]>
    byTagName: Map<string, Element[]>
  }
  resizeObservers: MockResizeObserverRecord[]
} => {
  const activeElement = new MockElementTarget() as unknown as Element
  const body = new MockElementTarget() as unknown as HTMLElement
  const documentTarget = new MockEventTarget() as unknown as Document
  const documentElement = new MockElementTarget() as unknown as HTMLElement
  const historyTarget = new MockHistoryTarget()
  const locationTarget = new MockLocationTarget()
  const visualViewport = new MockEventTarget() as unknown as VisualViewport
  const windowTarget = new MockEventTarget() as unknown as Window

  const byClassName = new Map<string, Element[]>()
  const byId = new Map<string, Element | null>()
  const byName = new Map<string, Element[]>()
  const bySelector = new Map<string, Element | null>()
  const bySelectorAll = new Map<string, Element[]>()
  const byTagName = new Map<string, Element[]>()

  const intersectionObservers: MockIntersectionObserverRecord[] = []
  const resizeObservers: MockResizeObserverRecord[] = []

  const driver: RuntimeDomDriver = {
    activeElement: () => activeElement,
    addEventListener: (target, type, listener, options) => {
      target.addEventListener(type, listener, options)
    },
    body: () => body,
    closest: (target, selector) => target.closest(selector),
    createIntersectionObserver: callback => {
      const record = createIntersectionObserverRecord(callback)

      intersectionObservers.push(record)

      return record.observer
    },
    createResizeObserver: callback => {
      const record = createResizeObserverRecord(callback)

      resizeObservers.push(record)

      return record.observer
    },
    document: () => documentTarget,
    documentElement: () => documentElement,
    history: () => historyTarget,
    getElementById: id => byId.get(id) ?? null,
    getElementsByClassName: className => byClassName.get(className) ?? [],
    getElementsByName: name => byName.get(name) ?? [],
    getElementsByTagName: tagName => byTagName.get(tagName) ?? [],
    querySelector: selector => bySelector.get(selector) ?? null,
    querySelectorAll: selector => bySelectorAll.get(selector) ?? [],
    removeEventListener: (target, type, listener, options) => {
      target.removeEventListener(type, listener, options)
    },
    location: () => locationTarget,
    visualViewport: () => visualViewport,
    window: () => windowTarget,
  }

  return {
    driver,
    emit: {
      activeElement: activeElement as unknown as MockEventTarget,
      body: body as unknown as MockEventTarget,
      document: documentTarget as unknown as MockEventTarget,
      documentElement: documentElement as unknown as MockEventTarget,
      history: historyTarget,
      location: locationTarget,
      visualViewport: visualViewport as unknown as MockEventTarget,
      window: windowTarget as unknown as MockEventTarget,
    },
    intersectionObservers,
    query: {
      byClassName,
      byId,
      byName,
      bySelector,
      bySelectorAll,
      byTagName,
    },
    resizeObservers,
  }
}

export const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}
