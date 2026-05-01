# Browser & DOM Effects

Fizz provides a comprehensive API for DOM queries, event listeners, observers, and browser operations. All DOM effects are state-scoped resources that are automatically cleaned up when a state exits, ensuring no memory leaks or orphaned event listeners.

This API works with **core Fizz** directly—no React required. Use it with vanilla JavaScript, any frontend framework, or the `@tdreyno/fizz-react` hook integration.

Browser and DOM effects are available through the `@tdreyno/fizz/browser` entrypoint:

```typescript
import { browserDriver, dom } from "@tdreyno/fizz/browser"
```

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
  AskUser: () => [
    confirm("Continue?"),
  ],
})

const Prompting = state({
  Ask: () => [
    prompt("Enter your name:"),
  ],
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

```typescript
import { state } from "@tdreyno/fizz"

const Navigating = state({
  GoHome: () => locationAssign("/"),
  OpenDocs: () => openUrl("https://docs.example.com", "_blank"),
  Back: () => historyBack(),
})
```

### Other browser operations

- `copyToClipboard(text)`: Copy text to clipboard
- `printPage()`: Open print dialog
- `postMessage(message, targetOrigin, transfer?)`: Post message to other window

```typescript
import { effect, state } from "@tdreyno/fizz"

const Sharing = state({
  Copy: (data) => copyToClipboard(data.text),
  Print: () => printPage(),
  PostData: (data) => postMessage(data, "*"),
})
```

## DOM queries

The `dom` builder provides type-safe query methods. Results are stored as state resources and can be chained.

### Singleton targets

Access global DOM objects that don't require queries:

```typescript
dom.window()        // globalThis.window
dom.document()      // globalThis.document
dom.body()          // document.body
dom.documentElement() // document.documentElement
dom.activeElement()  // document.activeElement
dom.visualViewport()// globalThis.visualViewport
```

### Query methods

All query methods support an optional scope argument to query within a specific element or document:

- `dom.getElementById(id)` — Returns a single element
- `dom.querySelector(selector)` — Returns a single element
- `dom.querySelectorAll(selector)` — Returns all matching elements
- `dom.getElementsByClassName(className)` — Returns live HTMLCollection as array
- `dom.getElementsByName(name)` — Returns all elements with that name
- `dom.getElementsByTagName(tagName)` — Returns live HTMLCollection as array
- `dom.closest(element, selector)` — Returns closest ancestor matching selector

### Scoped queries

Chain queries from acquired elements:

```typescript
import { dom, state } from "@tdreyno/fizz"

const Content = state({
  Enter: () => [
    dom.id("app", "appContainer"),
    dom.from("appContainer").querySelectorAll(".item", "items"),
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

Bind event listeners to elements with automatic cleanup via `dom.listen(...)`. Listeners are state-scoped resources and detach when the state exits.

```typescript
dom.listen(targetResourceId, eventType, callback, options?)
```

Arguments:

- `targetResourceId`: Resource ID of the event target (must be an EventTarget)
- `eventType`: Event type string (e.g., `"click"`, `"input"`, `"scroll"`)
- `callback`: Handler that receives the event and fires an action
- `options`: Optional `AddEventListenerOptions`

The callback receives the DOM event and should return an action:

```typescript
import { dom, state } from "@tdreyno/fizz"

const inputChanged = action("InputChanged").withPayload<string>()
const submitted = action("Submitted")

const Editing = state({
  Enter: () => [
    dom.querySelector("input[name='query']", "searchInput"),
    dom.listen("searchInput", "input", (event) => {
      const target = event.target as HTMLInputElement
      return inputChanged(target.value)
    }),
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

## Observers

Fizz supports both `IntersectionObserver` and `ResizeObserver` with state-scoped lifecycle management.

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
      (entries) => itemInView(entries[0].isIntersecting),
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

const containerResized = action("ContainerResized")
  .withPayload<{ width: number; height: number }>()

const Layout = state({
  Enter: () => [
    dom.id("main", "mainContainer"),
    dom.observeResize(
      "mainContainer",
      (entries) => {
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
  confirm: (message) => {
    // Custom confirmation logic
    return true
  },
  getElementById: (id) => {
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

const Searching = state<Enter | typeof searchChanged | typeof resultClicked, Data>({
  Enter: () => [
    dom.querySelector("[data-results]", "resultsContainer"),
    dom.querySelectorAll("[data-result]", "resultItems"),
    dom.listen("resultsContainer", "click", (event) => {
      const target = event.target as HTMLElement
      const id = target.dataset.resultId
      return id ? resultClicked(id) : searchChanged("")
    }),
    dom.observeIntersection(
      "resultsContainer",
      (entries) => viewportEntered(),
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
