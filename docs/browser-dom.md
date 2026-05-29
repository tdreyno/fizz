# Browser & DOM Effects

Fizz provides a comprehensive API for DOM queries, event listeners, observers, and browser operations. All DOM effects are state-scoped resources that are automatically cleaned up when a state exits, ensuring no memory leaks or orphaned event listeners.

This API works with **core Fizz** directly—no React required. Use it with vanilla JavaScript, any frontend framework, or the `@tdreyno/fizz-react` hook integration.

Browser and DOM effects are available through the `@tdreyno/fizz/browser` entrypoint:

```typescript
import { browserDriver, createBrowserDriver, dom } from "@tdreyno/fizz/browser"
```

## Shadow DOM support

Fizz supports Web Components and Shadow DOM as a first-class workflow.

Use `defaultDomQueryScope` at runtime creation to make unscoped query effects (`dom.querySelector`, `dom.getElementById`, `dom.input`, etc.) resolve against a shadow root by default:

```typescript
import { createRuntime, enter } from "@tdreyno/fizz"
import { browserDriver } from "@tdreyno/fizz/browser"

const root = hostElement.shadowRoot

const runtime = createRuntime(machine, machine.states.Ready(), {
  browserDriver,
  defaultDomQueryScope: root ?? undefined,
})

await runtime.run(enter())
```

For advanced setup, build a driver that bakes the default query scope in:

```typescript
import { createBrowserDriver } from "@tdreyno/fizz/browser"

const browserDriver = createBrowserDriver({
  defaultQueryScope: hostElement.shadowRoot ?? undefined,
})
```

Both approaches are additive and opt-in. Existing runtime behavior remains unchanged when no default scope is provided.

`dom.outsidePointerDown(...)` and `dom.outsideFocusIn(...)` use `event.composedPath()` when available, calling it with the original event as context to ensure correct behavior across all browsers and runtimes. This makes outside detection work correctly across shadow boundaries and retargeted events.

## Browser effects

Browser effects perform browser-level operations like navigation, alerts, and message posting. These are triggered through the `browserDriver` passed to the runtime:

```typescript
const runtime = new Runtime(context, actions, outputs, {
  browserDriver, // provides default implementations
})
```

### Dialog effects

- `alert(message)`: Display an alert dialog
- `confirm(message)`: Display a confirmation dialog; fires `confirmAccepted()` or `confirmRejected()`
- `prompt(message)`: Display a prompt dialog; fires `promptSubmitted(value)` or `promptCancelled()`

```typescript
import { action, confirm, prompt, state } from "@tdreyno/fizz"

const userConfirmed = action("Confirmed")
const userRejected = action("Rejected")
const textSubmitted = action("TextSubmitted").withPayload<string>()

const Deciding = state({
  AskUser: () => [confirm("Continue?")],
})

const Prompting = state({
  Ask: () => [prompt("Enter your name:")],
})
```

### Navigation effects

- `locationAssign(url)`: Navigate to URL (like `window.location.assign`)
- `locationReplace(url)`: Replace history entry (like `window.location.replace`)
- `locationReload()`: Reload the page
- `openUrl(url, target?, features?)`: Open URL in a new window/tab
- `historyBack()`: Navigate back in history
- `historyForward()`: Navigate forward in history
- `historyGo(delta)`: Jump in history by delta
- `historyPushState(state, url?)`: Push a new history entry
- `historyReplaceState(state, url?)`: Replace the current history entry
- `historySetScrollRestoration(value)`: Set `"auto"` or `"manual"` scroll restoration
- `locationSetHash(hash)`: Set `location.hash`
- `locationSetHref(href)`: Set `location.href` (navigate)
- `locationSetHost(host)`: Set `location.host`
- `locationSetHostname(hostname)`: Set `location.hostname`
- `locationSetPathname(pathname)`: Set `location.pathname`
- `locationSetPort(port)`: Set `location.port`
- `locationSetProtocol(protocol)`: Set `location.protocol`
- `locationSetSearch(search)`: Set `location.search`

```typescript
import {
  historyPushState,
  historySetScrollRestoration,
  locationSetHash,
  state,
} from "@tdreyno/fizz"

const Navigating = state({
  GoToPage: (_data, page: number) =>
    historyPushState({ page }, `/page/${page}`),
  GoHome: () => locationAssign("/"),
  OpenDocs: () => openUrl("https://docs.example.com", "_blank"),
  Back: () => historyBack(),
  HashJump: () => locationSetHash("#section-2"),
  DisableScrollRestore: () => historySetScrollRestoration("manual"),
})
```

### Other browser operations

- `copyToClipboard(text)`: Copy text to clipboard
- `printPage()`: Open print dialog
- `postMessage(message, targetOrigin, transfer?)`: Post message to other window

```typescript
import { effect, state } from "@tdreyno/fizz"

const Sharing = state({
  Copy: data => copyToClipboard(data.text),
  Print: () => printPage(),
  PostData: data => postMessage(data, "*"),
})
```

## Imperative DOM writes

Every DOM resource builder exposes typed imperative-write helpers. Prefer `classList`, `classListSet`, `callMethod`, `applyMethod`, `setValue`, `setChecked`, `setSelectionRange`, `setProperty`, `setAttribute`, `setText`, and `dispatchEvent` when the intent fits; reach for `.mutate(fn)` only for one-off tweaks that none of them cover.

Each mutator call still returns an array-compatible value whose first entries are `[acquireEffect, mutateEffect]`, but that return value is now chainable. This means you can keep existing array usage and also compose multiple writes as one fluent return.

Before:

```typescript
Enter: ({ data }) => [
  dom.fromElement(data.hiddenInput, "hidden").setValue(data.serialized),
  dom.fromElement(data.hiddenInput, "hidden").mutate(element => {
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }),
]
```

After:

```typescript
Enter: ({ data }) =>
  dom
    .fromElement(data.hiddenInput, "hidden")
    .setValue(data.serialized)
    .mutate(element => {
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
```

### `.classList(operations)`

Grouped class-list mutation. Pass any combination of `add`, `remove`, `toggle`, and `replace` in a single call. Each token field accepts a single string or an array of strings, and `replace` accepts a single `[from, to]` tuple or an array of tuples. Operations apply in the order **`remove` → `replace` → `toggle` → `add`**, which makes the common "drop old state, then add new state" pattern a single statement:

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

For the common single-class case, drop the brackets:

```typescript
dom.fromElement(data.row, "row").classList({ add: "selected" })

dom.fromElement(data.tab, "tab").classList({
  replace: ["tab-inactive", "tab-active"],
})
```

On multi-element resources (`querySelectorAll`, `getElementsByClassName`, etc.) the operations apply to every matched element.

### `.classListSet(classes)`

Replaces the element's entire class list with the provided tokens:

```typescript
dom.fromElement(data.row, "row").classListSet(["row", "selected"])
```

### `.callMethod(name, ...args)` and `.applyMethod(name, args)`

Invoke a method on the acquired element. `callMethod` mirrors `Function.prototype.call` (variadic args); `applyMethod` mirrors `Function.prototype.apply` (a single args array — handy when args already live in state or in a tuple):

```typescript
// Web component popover — no args
dom
  .querySelectorAll<EmojiPickerField>("emoji-picker-field", "emojiPickers")
  .callMethod("closePopover")

// Smooth scroll — args literal
dom
  .querySelector<HTMLDivElement>(".checkout", "checkout")
  .callMethod("scrollTo", { top: 0, behavior: "smooth" })

// Args from state
dom.fromElement(data.input, "input").applyMethod("focus", data.focusArgs)
```

When the builder's element type is known (via `dom.fromElement(el)` or a parameterized query like `dom.querySelector<HTMLInputElement>(...)`), `name` and `args` are type-checked against the element. For untyped queries the call is still safe at runtime: elements that do not implement the method are skipped without throwing.

On multi-element resources both helpers invoke the method on every element.

### Input and form field helpers

Use typed write helpers for form machines and autocomplete flows to avoid ad-hoc mutate blocks:

```typescript
dom.input("#search", "searchInput").setValue(data.query)

dom
  .input("#search", "searchInput")
  .setSelectionRange(data.cursorStart, data.cursorEnd, "forward")

dom.input("#search", "searchInput").dispatchEvent("input")

dom.input("#acceptTerms", "acceptTerms").setChecked(data.accepted)

dom.input("#search", "searchInput").setAttribute("autocomplete", "off")

dom.fromElement(datalist, "datalist").setInnerHTML(html)

dom.fromElement(container, "container").clearChildren()

dom.fromElement(container, "container").appendChildren(row)

dom.fromElement(container, "container").prependChildren(header)

dom.fromElement(container, "container").replaceChildren(row)

dom
  .fromElement(datalist, "datalist")
  .ownerDocument()
  .replaceChildren(listHeader)
```

`dispatchEvent(type, init?)` creates events in the target element's realm: events are synthesized from the element's `ownerDocument.defaultView` when available, falling back to `globalThis` if no realm exists. This ensures proper event behavior in jsdom and cross-realm DOM testing scenarios. Defaults to `{ bubbles: true, cancelable: true }` and supports `CustomEvent` payloads when `init.detail` is provided.

You can pass options as the second parameter:

```typescript
dom.input("#search", "searchInput").dispatchEvent("input", { bubbles: true })
```

Or pass a prebuilt event instance when you already have one:

```typescript
dom
  .fromElement(input, "searchInput")
  .dispatchEvent(new Event("input", { bubbles: true }))
```

Autocomplete example:

```typescript
import { action, state } from "@tdreyno/fizz"
import { dom } from "@tdreyno/fizz/browser"

const suggestionAccepted = action("SuggestionAccepted").withPayload<{
  cursorEnd: number
  nextValue: string
}>()

const Autocomplete = state({
  Enter: () => [dom.input("#search", "searchInput")],
  SuggestionAccepted: (_data, payload) =>
    dom
      .input("#search", "searchInput")
      .setValue(payload.nextValue)
      .setSelectionRange(payload.cursorEnd, payload.cursorEnd)
      .dispatchEvent("input"),
})
```

### `.mutate(fn)` — escape hatch

For DOM writes that none of the helpers above cover, use `.mutate(fn)`. The callback receives the acquired element and runs synchronously when the effect is dispatched:

```typescript
const Scrolling = state<Enter>({
  Enter: () =>
    dom.document().mutate(doc => {
      doc.documentElement.scrollTop = 0
    }),
})
```

The callback is typed to the element the builder targets — `Document` for `dom.document()`, `HTMLBodyElement` for `dom.body()`, `Element` for query builders, and so on.

## DOM queries

The `dom` builder provides type-safe query methods. Results are stored as state resources and can be chained.

All `dom.*` builders, including `dom.fromElement(...)` and selector builders, are already effects. Return them directly from handlers; `.resource()` is optional and equivalent to returning the builder itself.

### Singleton targets

Access global DOM objects that don't require queries:

```typescript
dom.window() // globalThis.window
dom.document() // globalThis.document
dom.body() // document.body
dom.documentElement() // document.documentElement
dom.activeElement() // document.activeElement
dom.visualViewport() // globalThis.visualViewport
dom.history() // live view of globalThis.history (length, scrollRestoration, state)
dom.location() // live view of globalThis.location (href, pathname, hash, …)
```

`dom.history()` and `dom.location()` are resource effects directly, so you can return them from a state handler without calling `.resource()`. They expose readonly data properties as live views, which means every property access reads the current browser value. They also support `listen()` for the `popstate` and `hashchange` events respectively:

```typescript
import { action, state } from "@tdreyno/fizz"
import { dom } from "@tdreyno/fizz/browser"

const navigated = action("Navigated").withPayload<PopStateEvent>()
const hashChanged = action("HashChanged").withPayload<HashChangeEvent>()

const Routing = state({
  Enter: () => [
    dom.history(),
    dom.history().listen("popstate", navigated),
    dom.location(),
    dom.location().listen("hashchange", hashChanged),
  ],

  Navigated: (_data, _event, { resources }) => {
    const history = resources["history"] as {
      length: number
      scrollRestoration: ScrollRestoration
      state: unknown
    }
    const location = resources["location"] as { pathname: string }
    // ...
  },
})
```

### Query methods

All query methods support an optional scope argument to query within a specific element or document:

- `dom.getElementById(id, resourceId?)` — Returns a single element
- `dom.querySelector(selector, resourceId?)` — Returns a single element
- `dom.querySelectorAll(selector, resourceId?)` — Returns all matching elements
- `dom.input(selector, resourceId?)` — Returns a single `HTMLInputElement`
- `dom.textarea(selector, resourceId?)` — Returns a single `HTMLTextAreaElement`
- `dom.select(selector, resourceId?)` — Returns a single `HTMLSelectElement`
- `dom.getElementsByClassName(className, resourceId?)` — Returns live HTMLCollection as array
- `dom.getElementsByName(name, resourceId?)` — Returns all elements with that name
- `dom.getElementsByTagName(tagName, resourceId?)` — Returns live HTMLCollection as array
- `dom.closest(scopeResourceId, selector, resourceId?)` — Returns closest ancestor matching selector

The trailing `resourceId` is optional. When omitted, Fizz generates a stable id for internal bookkeeping. Pass an explicit id when you need to reference the resource by name (for example from `dom.listen("itemId", ...)`).

All query methods accept an optional element-type generic that flows into the builder, which makes `.callMethod` / `.applyMethod` type-check against the element interface and gives `.mutate` a narrower callback parameter:

```typescript
dom.querySelector<HTMLInputElement>(".title", "title")
dom.querySelectorAll<EmojiPickerField>("emoji-picker-field", "pickers")
dom.getElementById<HTMLDialogElement>("modal", "modal")
```

The generic only narrows the TypeScript type — runtime behavior is unchanged.

### Choosing input, textarea, or select

Use the typed convenience query that matches your form control so helper calls stay explicit and discoverable:

- `dom.input(...)`: Single-line text inputs, hidden fields, checkboxes/radios, and autocomplete text fields. Pair with `setValue`, `setChecked`, `setSelectionRange`, and `dispatchEvent("input")` for suggestion-accept flows.
- `dom.textarea(...)`: Multi-line text editing where caret/selection updates and value writes are applied to long-form content.
- `dom.select(...)`: Option-based controls where you typically update selected value and then emit `change`.

When a control type is not known ahead of time, use `dom.querySelector<TElement>(...)` with an explicit generic. Keep `.mutate(...)` as the fallback only when no typed helper covers the write.

Use `dom.fromElement(element, resourceId?)` when you already have a DOM element reference and want the full fluent builder (`mutate`, `listen`, observers, `resource`) without doing a query lookup. When `resourceId` is omitted, one is generated automatically.

### Scoped queries

Chain queries from acquired elements:

```typescript
import { dom, state } from "@tdreyno/fizz"

const Content = state({
  Enter: () => [
    dom.id("app", "appContainer"),
    dom.from("appContainer").querySelectorAll(".item", "items"),
    dom.from("appContainer").input("#search", "searchInput"),
    dom.from("appContainer").textarea("#notes", "notesInput"),
    dom.from("appContainer").select("#country", "countryInput"),
  ],
})
```

### Example

```typescript
import { dom, state } from "@tdreyno/fizz"

const Initializing = state<Enter>({
  Enter: () => [
    dom.window("window"),
    dom.document("document"),
    dom.body("body"),
    dom.querySelector("[data-viewport]", "viewport"),
  ],
})
```

Resources are available in handler utilities:

```typescript
const Processing = state({
  Click: (_data, _payload, { resources }) => {
    const viewport = resources.viewport as HTMLElement
    console.log(viewport.getBoundingClientRect())
  },
})
```

## Event listeners

Bind event listeners to elements with automatic cleanup via `dom.listen(...)`. Listeners are state-scoped resources and detach when the state exits. Under the hood, Fizz keeps the acquire effect and the ordered listener list together in a single `domChain` wrapper, so chained listener helpers can accumulate on the same resource.

```typescript
dom.listen(targetResourceId, eventType, callback, options?)
```

Arguments:

- `targetResourceId`: Resource ID of the event target (must be an EventTarget)
- `eventType`: Event type string (e.g., `"click"`, `"input"`, `"scroll"`)
- `callback`: Handler that receives the event and fires an action
- `options`: Optional `AddEventListenerOptions` with optional `coalesce` and `order`

`coalesce` controls how bursty DOM events are collapsed before dispatch:

- `"none"` (default): fire every event
- `"animation-frame"`: dispatch only the latest event per animation frame
- `"microtask"`: dispatch only the latest event per microtask tick

`order` controls deterministic same-turn listener invocation among listeners
registered through the same runtime, for the same target, event type, and
capture/passive mode:

- `"before-default"`: invoke before default listeners
- `"default"` (default): preserve existing behavior
- `"after-default"`: invoke after default listeners

Note: ordering applies to listener invocation. If a `"before-default"` listener
uses coalescing, its action can still dispatch later than a non-coalesced
`"default"` listener.

The callback receives the DOM event and should return an action:

```typescript
import { dom, state } from "@tdreyno/fizz"

const inputChanged = action("InputChanged").withPayload<string>()
const submitted = action("Submitted")

const Editing = state({
  Enter: () => [
    dom.querySelector("input[name='query']", "searchInput"),
    dom.listen(
      "searchInput",
      "input",
      event => {
        const target = event.target as HTMLInputElement
        return inputChanged(target.value)
      },
      { order: "before-default" },
    ),
  ],

  Submit: () => [
    dom.querySelector("button[type='submit']", "submitButton"),
    dom.listen("submitButton", "click", () => submitted()),
  ],
})
```

Multiple listeners on the same target are supported:

```typescript
const Tracking = state({
  Enter: () => [
    dom.window("window"),
    dom.listen("window", "resize", () => windowResized()),
    dom.listen("window", "scroll", () => windowScrolled()),
    dom.listen("window", "beforeunload", () => beforeUnload()),
  ],
})
```

Coalescing example for drag/scroll style high-frequency events:

```typescript
const Dragging = state({
  Enter: () => [
    dom.window("window"),
    dom.listen(
      "window",
      "pointermove",
      event => pointerMoved((event as PointerEvent).clientX),
      { coalesce: "animation-frame", passive: true },
    ),
  ],
})
```

### Convenience onEvent helpers

Every DOM builder now exposes convenience listener helpers for valid event keys on that target.

Example:

```typescript
const Tracking = state({
  Enter: () => [
    dom.document().onMouseDown(event => {
      return didPress((event as MouseEvent).button)
    }),
    dom.window().onResize(() => viewportChanged()),
  ],
})
```

> Note: Handler return arrays are flattened one level, so DOM helpers (and any
> other helper that produces an array of effects) can be returned inline
> without the `...` spread operator.

Helpers are type-safe per target and map directly to `.listen(...)`:

- `dom.document().onMouseDown(handler)` -> `dom.document().listen("mousedown", handler)`
- `dom.history().onPopState(handler)` -> `dom.history().listen("popstate", handler)`
- `dom.location().onHashChange(handler)` -> `dom.location().listen("hashchange", handler)`

For the full event-to-helper mapping table across `window`, `document`, element targets, `visualViewport`, `history`, and `location`, see [DOM Listener Convenience Helper Mappings](dom-listener-helper-mappings.md).

### Fluent listener chains

`listen(...)` and keyboard `onEvent` helpers also support fluent chaining when called without a handler.

```typescript
import { dom } from "@tdreyno/fizz/browser"

const submitRequested = action("SubmitRequested")
const ignoredKey = action("IgnoredKey")

const Listening = state({
  Enter: () =>
    dom
      .document()
      .onKeyPress()
      .matchesKey("Enter")
      .chainToAction(submitRequested, ignoredKey),
})
```

You can also chain from the low-level listener entrypoint:

```typescript
dom
  .document()
  .listen("keydown")
  .matchesKey({ key: "Escape", ctrlKey: false, metaKey: false })
  .chainToAction(closeRequested)
```

Available fluent helpers in this release:

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

For common dismissal flows, use document-scoped helpers:

```typescript
const dismissRequested = action("DismissRequested")
const ignorePointer = action("IgnorePointer")

const Listening = state({
  Enter: () =>
    dom
      .outsidePointerDown({ inside: [menuRoot], includeTrigger: menuButton })
      .chainToAction(dismissRequested, ignorePointer),
})
```

```typescript
dom
  .outsideFocusIn({ inside: [menuRoot], includeTrigger: menuButton })
  .chainToAction(dismissFromFocus)
```

### Link bypass helper

Use `isBypassedLinkActivation(event)` when intercepting link clicks for in-app routing.

```typescript
import { isBypassedLinkActivation } from "@tdreyno/fizz/browser"

function onDocumentClick(event: MouseEvent) {
  if (isBypassedLinkActivation(event)) {
    return
  }

  event.preventDefault()
  runtime.run(navigateRequested())
}
```

## Observers

Fizz supports both `IntersectionObserver` and `ResizeObserver` with state-scoped lifecycle management.

Observers are created in the observed element's realm: Fizz resolves the `IntersectionObserver` / `ResizeObserver` constructor from the target element's `ownerDocument.defaultView`, falling back to `globalThis` when no realm is available. This keeps observers working correctly in jsdom and cross-realm DOM setups (for example, elements that live inside an iframe document).

### Intersection Observer

Monitor when elements enter/leave the viewport:

```typescript
dom.observeIntersection(
  targetResourceId,
  callback,
  resourceId?,
  options?,
)
```

```typescript
import { dom, state } from "@tdreyno/fizz"

const itemInView = action("ItemInView").withPayload<boolean>()

const Viewing = state({
  Enter: () => [
    dom.id("item-1", "item"),
    dom.observeIntersection(
      "item",
      entries => itemInView(entries[0].isIntersecting),
      "itemObserver",
      { threshold: [0, 0.5, 1] },
    ),
  ],
})
```

### Resize Observer

Monitor element size changes:

```typescript
dom.observeResize(
  targetResourceId,
  callback,
  resourceId?,
  options?,
)
```

```typescript
import { dom, state } from "@tdreyno/fizz"

const containerResized = action("ContainerResized").withPayload<{
  width: number
  height: number
}>()

const Layout = state({
  Enter: () => [
    dom.id("main", "mainContainer"),
    dom.observeResize(
      "mainContainer",
      entries => {
        const { width, height } = entries[0].contentRect
        return containerResized({ width, height })
      },
      "layoutObserver",
    ),
  ],
})
```

## Resource scoping and cleanup

All DOM queries and observers are state-scoped resources that clean up automatically:

```typescript
import { dom, state } from "@tdreyno/fizz"

const Active = state({
  Enter: () => [
    dom.window("window"),
    dom.listen("window", "resize", () => windowResized()),
  ],

  // On exit: window listener detaches, window resource released
})

const Inactive = state({
  Enter: () => {
    // Fresh state: new window query, new listener
    return [
      dom.window("window"),
      dom.listen("window", "scroll", () => windowScrolled()),
    ]
  },
})
```

When a state transition occurs or a state exits, all DOM resources for that state are released and observers are disconnected.

## Custom drivers

Provide a custom `browserDriver` to override default behaviors (useful for testing or custom environments):

```typescript
import { browserDriver as defaultDriver } from "@tdreyno/fizz/browser"

const customDriver = {
  ...defaultDriver,
  confirm: message => {
    // Custom confirmation logic
    return true
  },
  getElementById: id => {
    // Custom query implementation
    return document.getElementById(id)
  },
}

const runtime = new Runtime(context, actions, outputs, {
  browserDriver: customDriver,
})
```

## Complete example

```typescript
import { action, Enter, state } from "@tdreyno/fizz"
import { dom } from "@tdreyno/fizz/browser"

const searchChanged = action("SearchChanged").withPayload<string>()
const resultClicked = action("ResultClicked").withPayload<string>()
const viewportEntered = action("ViewportEntered")

type Data = {
  results: string[]
  selected: string | null
}

const Searching = state<
  Enter | typeof searchChanged | typeof resultClicked,
  Data
>({
  Enter: () => [
    dom.querySelector("[data-results]", "resultsContainer"),
    dom.querySelectorAll("[data-result]", "resultItems"),
    dom.listen("resultsContainer", "click", event => {
      const target = event.target as HTMLElement
      const id = target.dataset.resultId
      return id ? resultClicked(id) : searchChanged("")
    }),
    dom.observeIntersection(
      "resultsContainer",
      entries => viewportEntered(),
      "resultsObserver",
    ),
  ],

  SearchChanged: (data, text, { resources, update }) => {
    // User typed, fetch new results
    return update({
      ...data,
      results: text ? mockSearch(text) : [],
      selected: null,
    })
  },

  ResultClicked: (data, resultId) => {
    // Result clicked, update selection
    return update({
      ...data,
      selected: resultId,
    })
  },
})
```

## Related Docs

- [Custom Effects](custom-effects.md)
- [State Resources](../docs/api.md#state-resources)
- [Testing](testing.md)
