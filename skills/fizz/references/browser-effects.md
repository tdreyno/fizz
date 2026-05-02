# Browser Effects Reference

Use this reference when the task involves browser DOM access, event listeners, intersection/resize observers, dialog effects, navigation, or imperative DOM writes.

All browser effects are imported from `@tdreyno/fizz/browser` unless otherwise noted. They must be used with a runtime that includes the browser module (pass `browserDriver` / `domDriver` at runtime creation).

---

## Why browser effects matter

Browser effects in Fizz have a key property: **they are automatically cleaned up when the machine transitions away from the state that started them**. DOM event listeners, resource acquisitions, and observers are all torn down on state exit without any manual teardown logic. This means:

- you cannot leak event listeners by forgetting `removeEventListener`
- you cannot observe a stale element after navigating away
- you can safely restart an observer by transitioning back into a state

This lifecycle guarantee is the main reason to use `dom.*` helpers instead of imperative browser calls in your state handlers.

---

## Imperative DOM write: `.mutate(fn)`

Use `.mutate(fn)` chained off any DOM resource builder to perform a direct DOM write as an effect. The callback receives the acquired element and is called synchronously when the effect is dispatched.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Scrolling = state<Enter>({
  Enter: () =>
    dom.document().mutate(doc => {
      doc.documentElement.scrollTop = 0
    }),
})
```

The callback is typed to the element the builder targets — `Document` for `dom.document()`, `HTMLBodyElement` for `dom.body()`, `Element` for query builders, and so on. `.mutate()` returns `[acquireEffect, mutateEffect]` so the resource is acquired automatically.

Use `.mutate` for scrolling, focus management, class toggling, or any write that is not modeled by a resource or listener. The callback cannot be async and should not trigger further state machine transitions internally.

Use `dom.fromElement(resourceId, element)` when a state already has an element reference and still needs fluent DOM effects (`mutate`, `listen`, observers, `resource`) with state-scoped lifecycle:

```typescript
const Done = state({
  Enter: data =>
    dom.fromElement("dragBlock", data.block).mutate(el => {
      el.classList.remove("dragging")
    }),
})
```

---

## DOM resource acquisition

DOM resources are state-scoped handles to real browser nodes. Fizz acquires them at state entry and releases them at state exit.

All `dom.*` builders, including `fromElement`, query methods, and singleton builders, are effects and can be returned directly from handlers. Calling `.resource()` is optional and equivalent.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Interactive = state<Enter>({
  Enter: () => [
    dom.getElementById("btn", "submit-btn"),
    dom.querySelector("form", ".checkout-form"),
  ],
})
```

**DOM query methods:**

| Method                                              | Signature                                            |
| --------------------------------------------------- | ---------------------------------------------------- |
| `dom.getElementById(resourceId, id)`                | acquires a single element by id                      |
| `dom.querySelector(resourceId, selector)`           | acquires first match                                 |
| `dom.querySelectorAll(resourceId, selector)`        | acquires a node list                                 |
| `dom.getElementsByClassName(resourceId, className)` | acquires matching elements                           |
| `dom.getElementsByName(resourceId, name)`           | acquires named elements                              |
| `dom.getElementsByTagName(resourceId, tag)`         | acquires tagged elements                             |
| `dom.fromElement(resourceId, element)`              | wraps a known element as a state-scoped DOM resource |

**Singleton builders** — already named, optional `resourceId`:

- `dom.body(resourceId?)`
- `dom.document(resourceId?)`
- `dom.documentElement(resourceId?)`
- `dom.window(resourceId?)`
- `dom.activeElement(resourceId?)`
- `dom.visualViewport(resourceId?)`
- `dom.history(resourceId?)`
- `dom.location(resourceId?)`

Use `dom.from(scopeResourceId).closest(resourceId, selector)` to traverse from an acquired resource.

---

## DOM event listeners

Chain `.listen(type, toAction, options?)` directly on a DOM resource builder. The listener is registered when the resource is acquired and removed when the state exits.

`options` accepts standard listener flags and optional event coalescing:

- `coalesce: "none"` (default) dispatches every event
- `coalesce: "animation-frame"` dispatches only the latest event per frame
- `coalesce: "microtask"` dispatches only the latest event per microtask turn

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Clicked = action("Clicked")
const Scrolled = action("Scrolled").withPayload<{ y: number }>()

const Watching = state<Enter | ReturnType<typeof Clicked>>({
  Enter: () => [
    ...dom.body().listen("click", () => Clicked()),
    ...dom
      .window()
      .listen("scroll", event =>
        Scrolled({ y: (event as ScrollEvent).scrollY }),
      ),
  ],
})
```

`listen(...)` returns an array of effects: `[acquireEffect, listenEffect]`. Spread with `...` when combining with other effects.

For high-frequency events, use coalescing to avoid flooding actions:

```typescript
...dom
  .window()
  .listen(
    "pointermove",
    event => PointerMoved({ x: (event as PointerEvent).clientX }),
    { coalesce: "animation-frame", passive: true },
  )
```

### Convenience onEvent helpers

All DOM builders expose typed convenience methods for valid event keys on that target.

Example:

```typescript
...dom.document().onMouseDown(event => Started((event as MouseEvent).button))
...dom.window().onResize(() => WindowResized())
```

Each helper delegates to `.listen(...)` with the matching string event name:

- `onMouseDown(...)` -> `.listen("mousedown", ...)`
- `onPopState(...)` -> `.listen("popstate", ...)`
- `onHashChange(...)` -> `.listen("hashchange", ...)`

See [DOM Listener Convenience Helper Mappings](./dom-listener-helper-mappings.md) for the full table of all event-name to helper-name mappings.

---

## Intersection observer

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Visible = action("Visible")
const Hidden = action("Hidden")

const Lazy = state<Enter>({
  Enter: () =>
    dom
      .getElementById("hero", "hero-section")
      .observeIntersection(entries =>
        entries[0].isIntersecting ? Visible() : Hidden(),
      ),
})
```

Overload with options:

```typescript
dom
  .getElementById("img", "lazy-img")
  .observeIntersection(
    entries => (entries[0].isIntersecting ? Load() : Unload()),
    { threshold: 0.25 },
  )
```

Named observer (for multiple observers on the same target):

```typescript
dom.getElementById("el", "my-el")
  .observeIntersection("viewport-watcher", entries => ...)
```

---

## Resize observer

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Resized = action("Resized").withPayload<{ width: number }>()

const Responsive = state<Enter | ReturnType<typeof Resized>>({
  Enter: () =>
    dom
      .getElementById("panel", "side-panel")
      .observeResize(entries =>
        Resized({ width: entries[0].contentRect.width }),
      ),
})
```

---

## Scoped DOM queries with `dom.from(...)`

Use `dom.from(scopeResourceId)` to scope queries relative to an already-acquired resource:

```typescript
import { dom } from "@tdreyno/fizz/browser"

const CardFocused = action("CardFocused")

const Card = state<Enter>({
  Enter: () => [
    dom.getElementById("card", "card-container"),
    ...dom
      .from("card")
      .closest("cta", ".cta-button")
      .listen("focus", () => CardFocused()),
  ],
})
```

---

## Dialog effects

`confirm(message)` and `prompt(message)` are asynchronous request/response effects. The machine receives the result as one of the built-in actions. These pending requests survive normal state transitions.

```typescript
import { confirm, prompt } from "@tdreyno/fizz"

const Confirming = state<Enter>({
  Enter: () => confirm("Delete this item?"),
  ConfirmAccepted: (data, _, { update }) => update({ ...data, deleted: true }),
  ConfirmRejected: noop,
})
```

Actions: `ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, `PromptCancelled`.

---

## Navigation and location effects

All navigation/location effects are one-way fire-and-forget. They do not emit follow-up actions.

```typescript
import {
  historyPushState,
  historyReplaceState,
  locationAssign,
  locationReload,
  locationReplace,
  locationSetPathname,
} from "@tdreyno/fizz"

const Navigating = state<Enter>({
  Enter: () => [
    historyPushState({ page: "home" }, "/"),
    // or
    locationSetPathname("/dashboard"),
  ],
})
```

**Available navigation helpers:**

- `historyBack()`, `historyForward()`, `historyGo(delta)`
- `historyPushState(state, url?)`, `historyReplaceState(state, url?)`
- `historySetScrollRestoration(value)`
- `locationAssign(url)`, `locationReplace(url)`, `locationReload()`
- `locationSetHash(hash)`, `locationSetHref(href)`, `locationSetHost(host)`
- `locationSetHostname(hostname)`, `locationSetPathname(pathname)`
- `locationSetPort(port)`, `locationSetProtocol(protocol)`, `locationSetSearch(search)`

Read current history and location values via `dom.history()` and `dom.location()` resource builders.

---

## Other one-way browser effects

```typescript
import {
  alert,
  copyToClipboard,
  openUrl,
  postMessage,
  printPage,
} from "@tdreyno/fizz"

const Sharing = state<Enter>({
  Enter: () => [
    alert("Saved!"),
    copyToClipboard("https://example.com/shared"),
    openUrl("https://example.com/help", "_blank", "noopener"),
    printPage(),
    postMessage({ type: "ping" }, "https://partner.example"),
  ],
})
```

---

## Runtime setup

Browser effects require the browser module to be active. Pass a `browserDriver` at runtime creation:

```typescript
import { browserDriver } from "@tdreyno/fizz/browser"
import { Runtime, createInitialContext, enter } from "@tdreyno/fizz"

const runtime = new Runtime(
  createInitialContext([MyState(initialData)]),
  actions,
  {},
  { browserDriver },
)

await runtime.run(enter())
```

In tests, pass a mock driver:

```typescript
const runtime = new Runtime(
  createInitialContext([...]),
  {},
  {},
  {
    browserDriver: {
      confirm: () => "accept",
      alert: jest.fn(),
    },
  },
)
```

---

## Related docs

- `references/resources.md` — resource lifecycle and fluent bridge API
- `references/async-and-scheduling.md` — timers, intervals, and animation frames
- `references/core-runtime.md` — runtime creation and state utils overview
