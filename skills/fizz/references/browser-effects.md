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

## Imperative DOM writes

Every DOM resource builder exposes typed imperative-write helpers. Prefer `classList`, `classListSet`, `callMethod`, `applyMethod`, `setValue`, `setChecked`, `setSelectionRange`, `setProperty`, `setAttribute`, `setText`, and `dispatchEvent` when the intent fits, and reserve `.mutate(fn)` for one-off writes that none of them cover. These helpers return `[acquireEffect, mutateEffect]`, so the resource is acquired automatically.

### `.classList(operations)`

Grouped class-list mutation in a single call. Operations apply in the order **`remove` → `replace` → `toggle` → `add`** so the "drop old state, then add new state" pattern fits in one statement.

```typescript
import { dom, state } from "@tdreyno/fizz/browser"

const Opening = state({
  Enter: data =>
    dom.fromElement(data.modal, "modal").classList({
      remove: ["hidden", "modal-closing"],
      add: ["modal-opening"],
    }),
})
```

`replace` takes `[oldToken, newToken]` or `Array<[oldToken, newToken]>`; `add`, `remove`, and `toggle` each take a single token string or an array of tokens. On multi-element resources every operation applies to every matched element.

```typescript
dom.fromElement(data.row, "row").classList({ add: "selected" })
dom.fromElement(data.tab, "tab").classList({
  replace: ["tab-inactive", "tab-active"],
})
```

### `.classListSet(classes)`

Replaces the element's entire class list:

```typescript
dom.fromElement(data.row, "row").classListSet(["row", "selected"])
```

### `.callMethod(name, ...args)` and `.applyMethod(name, args)`

Invoke a method on the acquired element. `callMethod` is variadic (modeled on `Function.prototype.call`); `applyMethod` takes a single args array (modeled on `Function.prototype.apply`).

```typescript
// Web component popover
dom
  .querySelectorAll<EmojiPickerField>("emoji-picker-field", "pickers")
  .callMethod("closePopover")

// Smooth scroll with literal args
dom
  .querySelector<HTMLDivElement>(".checkout", "checkout")
  .callMethod("scrollTo", { top: 0, behavior: "smooth" })

// Args already in state data
dom.fromElement(data.input, "input").applyMethod("focus", data.focusArgs)
```

When the builder's element type is known (via `dom.fromElement(el)` or a parameterized query like `dom.querySelector<HTMLInputElement>(...)`), `name` and `args` are type-checked against the element. For untyped queries the call is still safe at runtime — elements that do not implement the method are skipped without throwing. On multi-element resources both helpers invoke the method on every element.

### Input and form-field helpers

Use these helpers instead of raw mutate blocks for common form writes:

- `setValue(value)`
- `setChecked(checked)`
- `setSelectionRange(start, end, direction?)`
- `setProperty(name, value)`
- `setAttribute(name, value)`
- `setInnerHTML(html)`
- `setText(text)`
- `clearChildren()`
- `appendChildren(...children)`
- `prependChildren(...children)`
- `replaceChildren(...children)`
- `ownerDocument()`
- `dispatchEvent(type, init?)`

`dispatchEvent` also accepts a prebuilt event instance: `dispatchEvent(new Event("input"))`.

`dispatchEvent` defaults to `bubbles: true` and `cancelable: true`; if `init.detail` is provided, Fizz dispatches a `CustomEvent`.

```typescript
dom.input("#search", "searchInput").setValue(data.query)
dom.input("#search", "searchInput").dispatchEvent("input")
dom.input("#search", "searchInput").dispatchEvent("input", { bubbles: true })
dom.input("#search", "searchInput").setSelectionRange(0, data.query.length)
```

Autocomplete flow example:

```typescript
const SuggestionAccepted = action("SuggestionAccepted").withPayload<{
  cursorEnd: number
  nextValue: string
}>()

state({
  SuggestionAccepted: (_data, payload) => [
    dom.input("#search", "searchInput").setValue(payload.nextValue),
    dom
      .input("#search", "searchInput")
      .setSelectionRange(payload.cursorEnd, payload.cursorEnd),
    dom.input("#search", "searchInput").dispatchEvent("input"),
  ],
})
```

Parameterize query helpers with the element type when you need typed `callMethod`/`applyMethod` or a narrower `mutate` callback:

```typescript
dom.querySelector<HTMLInputElement>(".title", "title")
dom.getElementById<HTMLDialogElement>("modal", "modal")
```

### `.mutate(fn)` — escape hatch

For writes that none of the typed helpers cover, use `.mutate(fn)`. The callback receives the acquired element and runs synchronously when the effect is dispatched.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Scrolling = state<Enter>({
  Enter: () =>
    dom.document().mutate(doc => {
      doc.documentElement.scrollTop = 0
    }),
})
```

The callback is typed to the element the builder targets — `Document` for `dom.document()`, `HTMLBodyElement` for `dom.body()`, `Element` for query builders, and so on. The callback cannot be async and should not trigger further state-machine transitions internally.

Use `dom.fromElement(element, resourceId?)` when a state already has an element reference and still needs fluent DOM effects (`classList`, `callMethod`, `mutate`, `listen`, observers, `resource`) with state-scoped lifecycle.

---

## DOM resource acquisition

DOM resources are state-scoped handles to real browser nodes. Fizz acquires them at state entry and releases them at state exit.

All `dom.*` builders, including `fromElement`, query methods, and singleton builders, are effects and can be returned directly from handlers. Calling `.resource()` is optional and equivalent.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Interactive = state<Enter>({
  Enter: () => [
    dom.getElementById("submit-btn", "btn"),
    dom.querySelector(".checkout-form", "form"),
  ],
})
```

**DOM query methods** — `resourceId` is optional and trailing. When omitted, Fizz auto-generates an id for internal bookkeeping. Pass an explicit id when you need to reference the resource by name (e.g. from `dom.listen("my-id", ...)`).

| Method                                               | Signature                                            |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `dom.getElementById(id, resourceId?)`                | acquires a single element by id                      |
| `dom.querySelector(selector, resourceId?)`           | acquires first match                                 |
| `dom.querySelectorAll(selector, resourceId?)`        | acquires a node list                                 |
| `dom.input(selector, resourceId?)`                   | acquires first match as `HTMLInputElement`           |
| `dom.textarea(selector, resourceId?)`                | acquires first match as `HTMLTextAreaElement`        |
| `dom.select(selector, resourceId?)`                  | acquires first match as `HTMLSelectElement`          |
| `dom.getElementsByClassName(className, resourceId?)` | acquires matching elements                           |
| `dom.getElementsByName(name, resourceId?)`           | acquires named elements                              |
| `dom.getElementsByTagName(tag, resourceId?)`         | acquires tagged elements                             |
| `dom.fromElement(element, resourceId?)`              | wraps a known element as a state-scoped DOM resource |

**Singleton builders** — already named, optional `resourceId`:

- `dom.body(resourceId?)`
- `dom.document(resourceId?)`
- `dom.documentElement(resourceId?)`
- `dom.window(resourceId?)`
- `dom.activeElement(resourceId?)`
- `dom.visualViewport(resourceId?)`
- `dom.history(resourceId?)`
- `dom.location(resourceId?)`

Use `dom.from(scopeResourceId).closest(selector, resourceId?)` to traverse from an acquired resource.

---

## DOM event listeners

Chain `.listen(type, toAction, options?)` directly on a DOM resource builder. The listener is registered when the resource is acquired and removed when the state exits.

`options` accepts standard listener flags and optional event coalescing:

- `coalesce: "none"` (default) dispatches every event
- `coalesce: "animation-frame"` dispatches only the latest event per frame
- `coalesce: "microtask"` dispatches only the latest event per microtask turn
- `order: "before-default" | "default" | "after-default"` controls
  deterministic same-turn listener invocation order

Ordering is runtime-local and applies to listeners on the same target, event
type, and capture/passive mode. `"default"` preserves existing behavior.

When `order` is combined with coalescing, order controls wrapper invocation,
but coalesced actions can still dispatch later than non-coalesced actions.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Clicked = action("Clicked")
const Scrolled = action("Scrolled").withPayload<{ y: number }>()

const Watching = state<Enter | ReturnType<typeof Clicked>>({
  Enter: () => [
    dom.body().listen("click", () => Clicked()),
    dom
      .window()
      .listen("scroll", event =>
        Scrolled({ y: (event as ScrollEvent).scrollY }),
      ),
  ],
})
```

`listen(...)` with a handler returns a `domChain` effect that contains the acquire effect plus the accumulated listener list. Handler return arrays are still flattened one level, so you can return the result directly inside the handler array without `...` spreading.

For object data states, event-mapper handlers can return a single plain object
as shorthand for same-state `update(nextData)`.

For high-frequency events, use coalescing to avoid flooding actions:

```typescript
dom
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
dom.document().onMouseDown(event => Started((event as MouseEvent).button))
dom.window().onResize(() => WindowResized())
```

Each helper delegates to `.listen(...)` with the matching string event name:

- `onMouseDown(...)` -> `.listen("mousedown", ...)`
- `onPopState(...)` -> `.listen("popstate", ...)`
- `onHashChange(...)` -> `.listen("hashchange", ...)`

See [DOM Listener Convenience Helper Mappings](./dom-listener-helper-mappings.md) for the full table of all event-name to helper-name mappings.

### Fluent listener chains

Call `listen(...)` or `onKeyDown`/`onKeyUp`/`onKeyPress` without a handler to build a fluent chain and map actions with `chainToAction(...)`.

```typescript
const SaveRequested = action("SaveRequested")

dom
  .document()
  .onKeyDown()
  .matchesKeyCombo({ key: "s", ctrlKey: true })
  .preventDefault()
  .chainToAction(SaveRequested)
```

```typescript
const SubmitRequested = action("SubmitRequested")
const IgnoredKey = action("IgnoredKey")

dom
  .document()
  .onKeyPress()
  .matchesKey("Enter")
  .chainToAction(SubmitRequested, IgnoredKey)
```

Current fluent chain helpers:

- `matchesKey("Enter" | matcher)`
- `matchesKeyCombo({ key, ctrlKey?, metaKey?, altKey?, shiftKey? })`
- `onlyPrimaryButton()`
- `noModifiers()`
- `preventDefault()`
- `stopPropagation()`
- `withKeyRepeat()` / `withoutKeyRepeat()`
- `once()`
- `when(predicate)`
- `mapEvent(mapper)`

### Outside helpers

Use document-scoped outside checks for dismissal flows.

```typescript
const DismissRequested = action("DismissRequested")

dom
  .outsidePointerDown({ inside: [menuRoot], includeTrigger: menuButton })
  .chainToAction(DismissRequested)
```

```typescript
dom
  .outsideFocusIn({ inside: [menuRoot], includeTrigger: menuButton })
  .chainToAction(DismissRequested)
```

### Link bypass helper

`isBypassedLinkActivation(event)` is a plain helper (not fluent). It returns `true` for events that should bypass SPA interception (`defaultPrevented`, non-primary button, or modifier keys).

---

## Intersection observer

```typescript
import { dom } from "@tdreyno/fizz/browser"

const Visible = action("Visible")
const Hidden = action("Hidden")

const Lazy = state<Enter>({
  Enter: () =>
    dom
      .getElementById("hero-section", "hero")
      .observeIntersection(entries =>
        entries[0].isIntersecting ? Visible() : Hidden(),
      ),
})
```

Overload with options:

```typescript
dom
  .getElementById("lazy-img", "img")
  .observeIntersection(
    entries => (entries[0].isIntersecting ? Load() : Unload()),
    { threshold: 0.25 },
  )
```

Named observer (for multiple observers on the same target):

```typescript
dom.getElementById("my-el", "el")
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
      .getElementById("side-panel", "panel")
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
    dom.getElementById("card-container", "card"),
    dom
      .from("card")
      .closest(".cta-button", "cta")
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
