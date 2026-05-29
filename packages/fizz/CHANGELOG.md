# @tdreyno/fizz

## 8.18.0

### Minor Changes

- ae429f7: # First-Class Shadow DOM Support

  Add first-class Shadow DOM support for browser DOM effects and query acquisition.

  This release introduces an opt-in runtime default DOM query scope and a configurable browser driver factory so unscoped DOM queries can target a Web Component's shadow root by default.

  **New APIs:**
  - `defaultDomQueryScope` runtime option (for `createRuntime(...)` and `Runtime` constructor options)
  - `createBrowserDriver({ defaultQueryScope })` from `@tdreyno/fizz/browser`
  - `RuntimeDomQueryScope` driver type now includes `Document | Element | ShadowRoot`

  **Behavior updates:**
  - `dom.outsidePointerDown(...)` and `dom.outsideFocusIn(...)` now prefer `event.composedPath()` when available, with `contains(...)` fallback, so outside detection works across shadow boundaries and retargeted events.
  - Runtime browser module query acquisition can use the configured default query scope when a query effect does not provide an explicit scope resource.

  Existing behavior remains unchanged unless a default scope is explicitly configured.

  **Example:**

  ```typescript
  import { createRuntime, enter } from "@tdreyno/fizz"
  import { browserDriver, createBrowserDriver } from "@tdreyno/fizz/browser"

  const runtime = createRuntime(machine, machine.states.Ready(), {
    browserDriver,
    defaultDomQueryScope: host.shadowRoot ?? undefined,
  })

  const scopedDriver = createBrowserDriver({
    defaultQueryScope: host.shadowRoot ?? undefined,
  })

  await runtime.run(enter())
  ```

### Patch Changes

- d71d019: Make DOM events and observers realm-aware so they work correctly in jsdom and cross-realm DOM setups (for example, elements inside an iframe document).

  When dispatching events from a string type (e.g., `dispatchEvent("input")`), Fizz now resolves the `Event` or `CustomEvent` constructor from the target element's `ownerDocument.defaultView` instead of always using `globalThis`. Likewise, `observeIntersection` and `observeResize` now resolve the `IntersectionObserver` / `ResizeObserver` constructor from the observed element's realm. All cases fall back to `globalThis` constructors when no realm is available.

  Consumers no longer need manual realm fallback workarounds; events and observers are created in the correct realm automatically.

  **Example:**

  ```typescript
  // Before: consumer had to implement fallback
  const EventCtor =
    element.ownerDocument?.defaultView?.Event ?? globalThis.Event
  element.dispatchEvent(new EventCtor("input", { bubbles: true }))

  // After: realm-aware automatically
  dom.fromElement(element, "target").dispatchEvent("input", { bubbles: true })
  // Event is created in element's realm automatically
  ```

  **Details:**
  - Adds realm resolution to `dispatchEvent` (`resolveWindowFromTarget()` / `getEventConstructor()` helpers)
  - The `RuntimeDomDriver` observer factory methods (`createIntersectionObserver`, `createResizeObserver`) now receive the observed `target` element as an optional argument so the default driver can resolve the correct realm constructor
  - The default browser driver and the test browser driver both resolve observers from the target element's realm
  - Adds test coverage: realm-aware event creation, target forwarding to observer factories, and realm-scoped observer construction
  - Updated documentation in `docs/browser-dom.md` and `skills/fizz/references/browser-effects.md`

## 8.17.1

### Patch Changes

- eb4ef62: Improve `dispatchEvent` documentation to highlight options parameter support. Added test coverage demonstrating both prebuilt event instances and options-based event dispatch.
- 6abe2d1: Add chainable DOM mutator return documentation and skills guidance. Updated examples now show fluent effect-return composition like `setValue(...).dispatchEvent(...).mutate(...)` while preserving array-compatible behavior notes.

## 8.17.0

### Minor Changes

- 2613abe: Add support for using action creators directly as computed handler keys in state definitions. This reduces duplication and ties the dispatch API directly to handler maps.

  **New capability:**

  ```typescript
  const save = action().withPayload<{ content: string }>()
  const cancel = action("Cancel")

  const Editing = state({
    [save]: (data, payload, { update }) =>
      update({ ...data, content: payload.content }),
    [cancel]: () => Done(),
  })
  ```

  **Key improvements:**
  - **Reduced duplication:** Handler keys now come from the action creator itself, not a separate string literal
  - **Better refactoring:** Renaming an action variable automatically updates the handler key
  - **Optional naming:** Action creators can be unnamed with `action()` and use auto-generated IDs, or named with `action("Name")` for debugging
  - **Full backward compatibility:** String-keyed handlers remain fully supported and unchanged

  **Breaking changes:** None. This is strictly additive; existing string-keyed handlers and named actions continue to work unchanged.

  **Type safety:** Payload inference for creator-keyed handlers is fully preserved. TypeScript correctly infers handler payload types from the action creator.

  **Debugging:** Debug labels from `action("Name")` are retained and available in logs and error messages. Unnamed actions use generated stable IDs.

  Also update architecture.md, api.md, and examples.md to showcase the new creator-key syntax alongside traditional string keys for backward-compatibility reference.

- 1ef7bd6: Make DOM listener builders chain-first: `listen(...)` now accumulates listeners inside a `domChain` wrapper instead of exposing the legacy tuple-style listener payload.

  Migration: update any code or tests that inspected the old listener array shape to read `data.acquire` and `data.listeners` on the returned `domChain` effect.

- a5c562a: Add DOM convenience helpers `setInnerHTML(html)`, `clearChildren()`, `appendChildren(...children)`, `prependChildren(...children)`, `replaceChildren(...children)`, and `ownerDocument()` to reduce common `mutate(...)` boilerplate for content updates and document-scoped chaining.

  `setInnerHTML(html)` is shorthand for property writes like `setProperty("innerHTML", html)`, while the children helpers are shorthands for `mutate(...)` calls around `append`, `prepend`, and `replaceChildren`.

  Add `dispatchEvent(new Event(...))` sugar alongside `dispatchEvent(type, init?)` so prebuilt event instances can be dispatched without dropping to `mutate(...)`.

  Also update browser DOM docs and browser-effects reference lists to include the new helpers.

- 312bcff: Support plain-object single returns as same-state update shorthand in object-data handlers. This applies across core `state(...)` handlers and fluent callbacks, including common async, timer/interval, and browser DOM mapper patterns.

  Guardrails remain explicit: array data states still require `update(...)`, and plain objects inside top-level returned handler arrays are not reinterpreted.

  Docs, skill references, and proposal guidance now describe the shorthand and its boundaries.

## 8.16.0

### Minor Changes

- 65abdb3: Allow nested child handlers in `stateWithNested(...)` to read parent state resources via `utils.resources` fallback.

  When child and parent resource keys overlap, child resources take precedence for that handler execution.

- b652080: Add typed DOM write helpers for form and input workflows, including `setValue`, `setChecked`, `setText`, `setProperty`, `setAttribute`, `setSelectionRange`, and `dispatchEvent` with sensible UI defaults.

  Also add input-specific query convenience builders via `dom.input(...)` and `dom.from(...).input(...)`, plus docs and browser-effects reference updates for declarative form/autocomplete patterns.

  Add matching convenience builders for `textarea` and `select` via `dom.textarea(...)`, `dom.select(...)`, and scoped variants `dom.from(...).textarea(...)` / `dom.from(...).select(...)`.

## 8.15.0

### Minor Changes

- 81f9eda: Runtime performance overhaul (Phase 3). Multi-machine frame-budget scenarios are
  now 9–13% faster than before, fire-and-forget burst dispatch is ~21% faster, and
  queue construction is ~51% cheaper. These wins come from a synchronous drain
  path in the queue runner, sync-capable command execution, closure dedup in the
  state wrapper, and an O(n) rewrite of `toResourcesRecord`.

  **Breaking changes** (observable):
  - `await runtime.run(action)` now resolves only after all transitively-triggered
    work in the same drain has completed. Previously, intermediate microtask
    yields between commands meant that nested-triggered actions could still be
    pending when `run()` resolved. Code that relied on observing intermediate
    states between `await run()` and the next event loop tick should switch to
    using a controlled async/timer driver, or assert on the final settled state.
  - `onContextChange` subscribers are now coalesced per `run()`: subscribers fire
    once at the end of a drain with the final state, rather than once per
    in-drain update. Code that counted intermediate change events will see fewer
    callbacks (one per `run()` call instead of one per `update(...)`).

## 8.14.0

### Minor Changes

- 74d3e72: Allow primitive values in `matchOutput(...)` handler maps.

  Handler-map entries can now be either a function `(action) => value | undefined`
  or a direct value. Direct values resolve the wait with that value whenever the
  output `type` matches, which is convenient for predicate-style mappings:

  ```ts
  const result = await runtime.runUntil(
    save(),
    matchOutput({
      Saved: true,
      Failed: false,
    }),
  )
  ```

  Function entries continue to work as before and may return `undefined` to skip
  a match.

## 8.13.0

### Minor Changes

- 18a870e: Add `runtime.waitUntil` and friends for awaiting state/output conditions.

  The runtime now exposes a small awaitable predicate API so consumers can
  stop reinventing `Promise + resolver + onOutput + cleanup` plumbing every
  time a state machine has a request/response surface:
  - `runtime.waitUntil(matcher, options?)` — primitive that resolves on the
    first match across state transitions and outputs.
  - `runtime.waitUntilState(stateOrMatcher, options?)` — sugar for matching
    a target state, with optional `where` predicate over state data.
  - `runtime.waitUntilOutput(matcher, options?)` — sugar for matching the
    next output. Accepts an action creator, a handler map keyed by action
    `type`, or a predicate.
  - `runtime.runUntil(action, matcher, options?)` — subscribes before
    dispatching so synchronous transitions are not missed.

  Matchers come from `matchState`, `matchOutput`, and `matchAny`. All four
  runtime methods accept the same options:
  - `signal?: AbortSignal` — rejects with `WaitUntilAbortError`.
  - `timeout?: number` — rejects with `WaitUntilTimeoutError`.
  - `includeCurrent?: boolean` — defaults to `true` for state matchers and
    resolves via microtask when the current state already matches.

  Pending waits reject with `RuntimeDisconnectedError` if the runtime
  disconnects. Each wait emits `wait-until-registered`, `wait-until-resolved`,
  and `wait-until-rejected` monitor events for debugger visibility.

  `@tdreyno/fizz-react` ships matching hooks that take the runtime returned
  from `useMachine(...)` and abort on unmount:
  - `useWaitUntilState(runtime, matcher, options?)` →
    `{ status, value, error }`
  - `useWaitUntilOutput(runtime, matcher, options?)` →
    `{ status, value, error }`
  - `useRunUntil(runtime)` → stable callback that aborts the previous wait
    when called again.

  See `docs/awaiting-conditions.md` for the full surface.

## 8.12.0

### Minor Changes

- 161cc20: Add `classList`, `classListSet`, `callMethod`, and `applyMethod` DOM effect
  helpers, plus an optional element-type generic on the query builders.

  Every DOM resource builder returned by `dom.<query>(...)`,
  `dom.fromElement(element, resourceId?)`, and `dom.from(scope).<query>(...)`
  now exposes four typed imperative-write helpers in addition to `.mutate(fn)`:
  - `.classList({ add?, remove?, toggle?, replace? })` — grouped class-list
    mutation in one call. Each token field accepts a single string or an array
    of strings, and `replace` accepts a single `[from, to]` tuple or an array
    of tuples. Operations apply in the order
    `remove` → `replace` → `toggle` → `add`. Multi-element resources apply
    every operation to every matched element.
  - `.classListSet(classes)` — replaces the element's entire class list.
  - `.callMethod(name, ...args)` — invokes a method on the acquired element,
    modeled on `Function.prototype.call` (variadic args).
  - `.applyMethod(name, args)` — same as `.callMethod` but takes a single args
    array, modeled on `Function.prototype.apply`.

  `.callMethod` and `.applyMethod` skip elements that do not implement the
  named method at runtime, so they are safe on heterogeneous lists.

  All four helpers desugar to the existing `domMutate` effect, so there are no
  new effect kinds in the runtime.

  The query helpers (`closest`, `getElementById`, `getElementsByClassName`,
  `getElementsByName`, `getElementsByTagName`, `querySelector`,
  `querySelectorAll`) now accept an optional `<TElement extends Element>`
  generic that flows into the returned builder. The default stays `Element`,
  so existing callers compile unchanged.

  ```ts
  // Before
  ...dom.fromElement(data.modal, "modal").mutate(node => {
    node.classList.remove("hidden", "modal-closing")
    node.classList.add("modal-opening")
  })

  // After
  ...dom.fromElement(data.modal, "modal").classList({
    remove: ["hidden", "modal-closing"],
    add: ["modal-opening"],
  })

  // Typed web-component method call
  ...dom
    .querySelectorAll<EmojiPickerField>("emoji-picker-field", "pickers")
    .callMethod("closePopover")
  ```

  `.mutate(fn)` is preserved as the escape hatch for writes that none of the
  typed helpers cover.

- 56922df: DOM effect builders now take `resourceId` as the trailing optional argument.

  `dom.getElementById`, `dom.querySelector`, `dom.querySelectorAll`,
  `dom.getElementsByClassName`, `dom.getElementsByName`,
  `dom.getElementsByTagName`, `dom.closest`, `dom.fromElement`, and their
  `dom.from(scope).*` scoped equivalents now accept the primary query argument
  first and a trailing optional `resourceId`. When `resourceId` is omitted, Fizz
  generates a stable id automatically for internal bookkeeping. Pass an explicit
  id when you need to reference the resource by name (for example from
  `dom.listen("my-id", ...)`).

  Migration:

  | Before                                   | After                                    |
  | ---------------------------------------- | ---------------------------------------- |
  | `dom.getElementById("btn", "submit")`    | `dom.getElementById("submit", "btn")`    |
  | `dom.querySelector("form", ".checkout")` | `dom.querySelector(".checkout", "form")` |
  | `dom.fromElement("node", element)`       | `dom.fromElement(element, "node")`       |
  | `dom.from("scope").closest("x", ".sel")` | `dom.from("scope").closest(".sel", "x")` |

  For one-off queries that do not need a stable name, omit the id entirely:
  `dom.querySelector(".item")`.

- d0bae6d: Flatten one level of nested arrays returned from state handlers.

  Handler return arrays are now flattened a single level before being converted
  to runtime commands. This means helpers that produce groups of effects — for
  example DOM builders like `dom.body().listen(...)`, the convenience
  `dom.<target>().on<Event>(...)` listener helpers, scoped queries returned from
  `dom.from(...)`, and branch returns inside `whichTimeout(...)` /
  `whichInterval(...)` — can be composed inline without the `...` spread
  operator:

  ```ts
  const Watching = state({
    Enter: () => [
      dom.body().listen("click", () => Clicked()),
      dom.window().onResize(() => WindowResized()),
    ],
  })
  ```

  A new exported type `NestedStateReturn` (a single `StateReturn` or a
  `ReadonlyArray<StateReturn>`) describes the items allowed inside the returned
  array. Existing handlers that return a flat array, a single effect/action, or
  a transition continue to work unchanged.

### Patch Changes

- 4ede125: `whichTimeout(...)` and `whichInterval(...)` branch maps are no longer required
  to be exhaustive. A timeout or interval id with no matching branch resolves to
  `undefined` and is treated as a no-op, matching how `state(...)` handles actions
  without a registered handler.

  Unknown ids outside the declared union are still rejected at the type level.

## 8.11.1

### Patch Changes

- 808add6: Add test harness parity for runtime command/client injection.

  `createTestHarness(...)` (and `createBrowserTestHarness(...)` through shared options) now support passing `commandHandlers`, `clients`, `commandMissingHandler`, `monitor`, and `debugLabel` to the underlying runtime.

  This makes it possible to test `commandEffect(...)` flows directly with harness utilities instead of switching to manual runtime setup.

## 8.11.0

### Minor Changes

- b8d3611: Add a new `@tdreyno/fizz/test/browser` entrypoint for platform-agnostic browser runtime tests.

  New testing APIs include:
  - `createBrowserTestHarness(...)`
  - `fireEvent(target, type, init?)`
  - `fireClick(target, init?)`
  - `fireInput(target, init?)`
  - `fireChange(target, init?)`
  - `fireSubmit(target, init?)`
  - `flushFrames(harness, count, frameMs?)`
  - `firePointerDown(target, init?)`
  - `firePointerMove(target, init?)`
  - `firePointerUp(target, init?)`
  - `fireFocusIn(target, init?)`
  - `fireFocusOut(target, init?)`
  - `fireKeyDown(target, init?)`
  - `fireKeyUp(target, init?)`
  - `firePointerDrag(target, options?)`
  - `fireTextInput(target, options)`
  - `fireFormSubmit(target, options?)`
  - `expectCommandOrder(harness, expectedTypes)`

  The browser harness accepts an explicit `document` and exposes framework-agnostic recorded browser-effect stubs through `harness.browserDriver`, making the helper usable from Jest, Vitest, and `node:test` setups.

- 8150308: ### Breaking: `commandChannel` — channel-level scheduling policy replaces per-call `latestOnlyKey`

  The per-call `latestOnlyKey` option on `commandChannel(...).command(type, payload, options?)` has been removed. Scheduling behaviour is now declared once when the channel is created.

  #### Migration

  **Before**

  ```ts
  const editor = commandChannel<Commands, "notesEditor">("notesEditor")

  editor.command(
    "setDocument",
    { document },
    { latestOnlyKey: "editor-setDocument" },
  )
  ```

  **After**

  ```ts
  const editor = commandChannel<Commands, "notesEditor">("notesEditor", {
    scheduling: { mode: "replace-pending", keyPrefix: "editor" },
  })

  editor.command("setDocument", { document })
  // coalescing key is derived automatically as "editor-setDocument"
  ```

  #### Three scheduling modes

  | Mode                                   | Behaviour                                                                                  |
  | -------------------------------------- | ------------------------------------------------------------------------------------------ |
  | `"fifo"` (default)                     | Commands run in arrival order; nothing is dropped                                          |
  | `"replace-pending"`                    | A queued (not yet running) command is replaced by a newer one with the same coalescing key |
  | `"replace-pending-and-cancel-running"` | Same as above, plus the currently executing handler has its `AbortSignal` aborted          |

  Per-command key overrides are supported via `commands.<type>.key`.

  #### Breaking: handler signature now receives `{ signal: AbortSignal }` as second argument

  All command handlers now receive a second argument containing an `AbortSignal`:

  **Before**

  ```ts
  const commandHandlers = {
    drag: {
      async updatePreview(payload) {
        /* ... */
      },
    },
  }
  ```

  **After**

  ```ts
  const commandHandlers = {
    drag: {
      async updatePreview(payload, { signal }) {
        await waitForFrame(signal)
        if (signal.aborted) return
        applyDragPreview(payload)
      },
    },
  }
  ```

  The signal is only aborted when using `"replace-pending-and-cancel-running"` mode. For `"fifo"` and `"replace-pending"` the signal is never aborted; existing handlers that ignore the second argument continue to work without changes (TypeScript will surface the new parameter in typed handler maps, requiring the signature to be updated).

  #### Payload-less commands

  Commands whose schema declares `payload: void | undefined` may now be called without a payload argument:

  ```ts
  const uiCommands = commandChannel<Commands, "toolbar">("toolbar")
  uiCommands.command("focusToggle") // no payload argument required
  ```

- c57fa10: Add typed DOM listener convenience helpers on resource builders, mapping valid `addEventListener` keys to `onX` methods.

  Examples:
  - `dom.document().onMouseDown(handler)`
  - `dom.window().onResize(handler)`
  - `dom.history().onPopState(handler)`
  - `dom.location().onHashChange(handler)`

  Each helper is type-safe per target event map and delegates to `.listen(...)` with the matching event name.

- 5d1f1c7: Add fluent DOM listener helper chaining for browser event handling.

  New browser APIs include:
  - `dom.document().onKeyPress().matchesKey(...).chainToAction(...)` (and the same pattern from `listen(...)`, `onKeyDown()`, and `onKeyUp()`)
  - `dom.outsidePointerDown(...)` and `dom.outsideFocusIn(...)` for document-scoped outside checks
  - `isBypassedLinkActivation(event)` for SPA link interception bypass checks

  The existing `listen(type, handler, options?)` and `onEvent(handler, options?)` forms remain supported.

- 87344ba: Add runtime teardown diagnostics APIs for tests and debugging.

  New runtime methods:
  - `runtime.getDiagnosticsSnapshot()` to inspect active listeners, resources, timers, async operations, and command channel queues
  - `runtime.assertCleanTeardown(options?)` to throw when disallowed diagnostics groups remain active

  This release also adds diagnostics coverage tests and updates docs/skill references for teardown assertions.

- 8159c53: Add `connectExternalSnapshot()` for standardized external store wiring.

  New API:
  - `connectExternalSnapshot(options)` — subscribes to an external store, selects a snapshot slice, and dispatches a Fizz action whenever the snapshot changes
  - `ConnectExternalSnapshotOptions<StoreState, Snapshot>` — typed options interface

  Built-in behaviors:
  - distinct-until-changed via configurable `equality` (defaults to `Object.is`)
  - optional `emitInitial` to dispatch on first connect
  - optional `loopGuard` to suppress re-dispatch when a machine write-back produces the same snapshot key
  - auto-cleanup when `runtime.disconnect()` is called

## 8.10.1

### Patch Changes

- 53d2a97: Fix coalesced DOM listener dispatching so animation-frame and microtask modes correctly keep the latest event while an action is still running, and harden latest-only imperative command queueing so synchronous handlers and queued replacements resolve through runAction reliably.
- 72865ad: Skip same-state `update(...)` transitions when the new data is strictly equal (`===`) to the current state data.

## 8.10.0

### Minor Changes

- 4c0fe89: Add `dom.fromElement(resourceId, element)` to `@tdreyno/fizz/browser`.

  This new DOM acquire helper wraps an already-known element reference as a state-scoped DOM resource, so it can use the same fluent APIs as other DOM builders (`mutate`, `listen`, `observeIntersection`, `observeResize`, and `resource`).

  This is useful when handlers already carry an element reference (for example, drag interactions) and still want explicit, chained DOM effects with normal Fizz resource lifecycle behavior.

- b364b6e: Add two runtime behavior upgrades to `@tdreyno/fizz`:
  - DOM listener coalescing in `@tdreyno/fizz/browser` via `dom.listen(..., { coalesce })` with support for `"none"`, `"animation-frame"`, and `"microtask"`.
  - Latest-only keyed command scheduling for command effects via `commandEffect(..., { latestOnlyKey })` and `commandChannel(...).command(..., { latestOnlyKey })`, so pending same-key commands in the same channel are replaced by the newest queued command.

  These updates improve high-frequency UI event handling and reduce stale queued imperative command work.

## 8.9.0

### Minor Changes

- 9ba395b: `startFrame()` previously started a continuous animation-frame loop that kept firing until explicitly cancelled. It now fires **once** and stops automatically. This aligns the naming with its literal meaning.

  ### Migration

  If you want a continuous loop (the old behavior), replace `startFrame()` with the new `startFrameLoop()`:

  ```ts
  // Before — continuous loop
  Enter: (_, __, { startFrame }) => startFrame()

  // After — still continuous loop
  Enter: (_, __, { startFrameLoop }) => startFrameLoop()

  // After — new one-shot usage (fires OnFrame exactly once)
  Enter: (_, __, { startFrame }) => startFrame()
  ```

  `cancelFrame()` and the `OnFrame` action type are unchanged and work with both.

  ## New: `startFrameLoop()` for continuous animation

  Use `startFrameLoop()` whenever you need a frame callback to re-fire automatically on every animation frame until explicitly cancelled:

  ```ts
  const Animating = state<Enter | OnFrame, { frameCount: number }>({
    Enter: (_, __, { startFrameLoop }) => startFrameLoop(),

    OnFrame: (data, _, { update, cancelFrame }) => {
      const next = { frameCount: data.frameCount + 1 }
      return next.frameCount >= 60
        ? [update(next), cancelFrame()]
        : update(next)
    },
  })
  ```

  ## New: `dom.mutate(fn)` for imperative DOM writes

  Use `dom.mutate(fn)` from `@tdreyno/fizz/browser` to perform imperative DOM writes as an explicit effect. The callback is called synchronously when the effect is processed, and like all browser effects it is scoped to the current state and cleaned up on transitions:

  ```ts
  import { dom } from "@tdreyno/fizz/browser"

  const Scrolling = state<Enter>({
    Enter: () =>
      dom.mutate(() => {
        document.documentElement.scrollTop = 0
      }),
  })
  ```

- 9df55e7: Add opt-in subpaths for debugging and registry utilities to improve tree-shaking
  - Create `@tdreyno/fizz/debug` subpath for debugging utilities (`createRuntimeDebugConsole`, `createRuntimeMonitor`)
  - Create `@tdreyno/fizz/registry` subpath for registry lifecycle APIs (`createRuntimeRegistry`, `RuntimeRegistry`)
  - Remove debug and registry exports from root `@tdreyno/fizz` export surface
  - Allows bundlers to tree-shake unused debug/registry code when not imported from subpaths
  - Maintains full backward compatibility through opt-in subpath imports
  - Comprehensive bundle size measurement and validation completed

## 8.8.0

### Minor Changes

- 623b4f3: Add command-channel ergonomics for imperative command effects.
  - Add `commandChannel(...)` helper for channel-bound command creation.
  - Add `commandChannel(...).command(type, payload)` as a DRY wrapper over `commandEffect(...)`.
  - Add `commandChannel(...).batch(commands, options?)` as a DRY wrapper over `effectBatch(...)` with bound channel.
  - Keep behavior unchanged from existing `commandEffect(...)` + `effectBatch(...)` runtime semantics.

### Patch Changes

- bb44320: Improve `fizz machines` and `fizz visualize` machine/state discovery to be export-agnostic and support single-file JavaScript machines.
  - Discover `createMachine(...)` roots without requiring `export default`.
  - Support named-exported and unexported top-level machine constants.
  - Resolve state entries from inline/local/imported state objects without requiring a specific export shape.
  - Include `.js` and `.jsx` sources in CLI machine discovery.
  - Preserve existing multi-file state-index visualization behavior while adding single-file inline-state graph support.

## 8.7.0

### Minor Changes

- 97f0f8b: # Resource Bridge

  Add fluent resource-event bridging to state-scoped resources.
  - Extend `resource(...)` with `.bridge(options)` and `.chainToAction(resolve, reject?)`.
  - Add runtime support for bridge event delivery with optional `latest` and `{ debounceMs }` pacing.
  - Keep bridge subscription lifecycle runtime-owned and state-scoped, including teardown and pending work cancellation on exit.
  - Document the bridge API in core docs and skill references.

- f59f9de: # Output Ergonomics

  Improve output ergonomics for adapter-oriented command channels.
  - Add `outputs` as a machine-definition alias for `outputActions`.
  - Reject machine definitions that include both `outputs` and `outputActions`.
  - Add `outputCommand(channel, type, payload)` as a direct state-handler helper (no extra `output(...)` wrapper needed).
  - Add `defineOutputMap(...)` for typed output map authoring.
  - Add runtime helpers `onOutputType(type, handler)` and `connectOutputChannel(channelHandlers)` for concise, typed output subscriptions.
  - Add fluent builder parity with `.withOutputs(...)` as an alias to output action registration.

- 9b02eb0: Add `effectBatch(...)` for ordered imperative command batching.
  - Supports optional `channel` for same-channel serialization.
  - Supports optional `onError` with default `"failBatch"`.
  - Supports both `chainToAction(...)` and `chainToOutput(...)` for batch completion/failure signaling.

- eb6f988: Add `runtime.runAndSelect(...)` for dispatching an action and immediately reading from the resulting state with either a machine selector or an inline projection.
- 0a4f39a: # Async chaining

  Move `startAsync(...)` and `debounceAsync(...)` to chain-first action mapping.
  - Change `startAsync(...)` to return a builder and map settled results with `.chainToAction(resolve, reject)`.
  - Change `debounceAsync(...)` to return a builder and map settled results with `.chainToAction(resolve, reject?)`.
  - Update async docs, skill references, and workspace examples to the fluent chaining form.
  - Keep the release marked as minor even though this changes the public API shape.

## 8.6.0

### Minor Changes

- 73e07f7: Add `debounceAsync(...)` for latest-wins debounced async flows with required `asyncId`, automatic in-flight cancellation on replacement, and explicit resolve/reject action mapping.
- ecd14d7: Add comprehensive DOM query, listener, and observer APIs as state-scoped resources:
  - **DOM Queries**: `dom.getElementById()`, `dom.getElementsByClassName()`, `dom.getElementsByName()`, `dom.getElementsByTagName()`, `dom.querySelector()`, `dom.querySelectorAll()`, `dom.closest()`
  - **Singleton Targets**: `dom.window()`, `dom.document()`, `dom.body()`, `dom.documentElement()`, `dom.activeElement()`, `dom.visualViewport()`
  - **Event Listeners**: `dom.listen(targetId, type, handler)` with automatic cleanup and scope-based lifecycle
  - **Observers**: `dom.observeIntersection()` and `dom.observeResize()` for viewport and size tracking
  - **Resource Scoping**: All queries, listeners, and observers are state-scoped resources automatically cleaned up on state exit
  - **Scoped Queries**: Chain queries from acquired elements using `dom.from(resourceId)`

  Available from `@tdreyno/fizz/browser` entrypoint. All effects integrate with the runtime's state resource system and support custom driver overrides for testing.

- 1a1606a: Add `dom.history()` and `dom.location()` as readonly resource singletons with event listener support, plus new browser mutation effects: `historyPushState`, `historyReplaceState`, `historySetScrollRestoration`, and `locationSetHash/Href/Host/Hostname/Pathname/Port/Protocol/Search`.
- 45b32d3: Add typed machine clients support via runtime options and state handler utilities, including `utils.clients` access in handlers.

  Add a no-build fluent machine API with `machine(name?)` and chainable `withStates`, `withActions`, `withOutputActions`, `withSelectors`, and `withClients` methods.

  Expose fluent state `withClients<...>()` typing so service dependencies are easy to inject and mock in tests.

- 63c683b: Add `createRuntimeRegistry(...)` for keyed runtime reuse and explicit disposal in non-React integrations.

  The utility supports primitive and object keys, optional lifecycle events, configurable disposal failure policy, and deterministic `disposeAll()` behavior.

- 51481e7: Add state-scoped resources with automatic cleanup on state exit via `resource(...)`, `abortController(...)`, and `subscription(...)`.

  State handlers now receive `utils.resources`, monitor events include resource lifecycle signals, and `@tdreyno/fizz/test` adds resource-focused harness helpers for custom resource testing.

## 8.5.0

### Minor Changes

- 43c7087: # Browser Runtime Support

  Adds first-class browser runtime support across core and React integration.
  - `@tdreyno/fizz`
    - Added browser effect helpers: `confirm(...)`, `prompt(...)`, `alert(...)`, `copyToClipboard(...)`, `openUrl(...)`, `printPage()`, `locationAssign(...)`, `locationReplace(...)`, `locationReload()`, `historyBack()`, `historyForward()`, `historyGo(...)`, and `postMessage(...)`.
    - Added built-in actions for browser request/response flows: `ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, and `PromptCancelled`.
    - Added runtime `browserDriver` support to execute browser effects.
    - Added a new public subpath export: `@tdreyno/fizz/browser`.
  - `@tdreyno/fizz-react`
    - `useMachine(...)` now accepts `driver` and forwards it to runtime `browserDriver`.
    - Runtime cleanup now calls `runtime.disconnect()` during stop/unmount lifecycle.

  Usage:
  - Import the browser implementation from `@tdreyno/fizz/browser` and pass it via React `useMachine(..., { driver: browserDriver })` or core `createRuntime(..., { browserDriver })`.
  - Model browser confirmation and prompt flows as machine state transitions that handle `ConfirmAccepted` / `ConfirmRejected` and `PromptSubmitted` / `PromptCancelled`.

## 8.4.0

### Minor Changes

- 0a8f15d: Rename the fluent helper export from `fluentAction(...)` to `action(...)` in `@tdreyno/fizz/fluent`.

  This is a breaking API change for fluent users importing `fluentAction`.

- a338ffe: Adds first-class machine selectors across core and React integrations.
  - `@tdreyno/fizz`
    - Added `selectWhen(...)` for colocated machine selectors with typed state narrowing.
    - Added matcher shorthand support (`selectWhen(State, { key: value })`) for boolean checks over `state.data`.
    - Added `runStateSelector(...)` and `matchesSelectorWhen(...)` utilities to evaluate selectors outside React runtimes.
    - Added selector exports and selector-aware `createMachine(...)` typing so selectors can be defined on machine roots.
    - Function selectors return `undefined` when `currentState` does not match; matcher selectors return `false` when not matched.
  - `@tdreyno/fizz-react`
    - `useMachine(...)` and `createMachineContext(...).useMachineContext()` now expose `machine.selectors` from machine-defined selectors.
    - Selector values recompute on context changes and support per-selector `equalityFn` reuse to avoid selected-value churn.
    - Added optimized selector mode via `disableAutoSelectors: true`, intended for pairing `useMachine(...)` with `useSelector(...)` in render-critical components.
    - Added selector coverage in React integration tests for type behavior, context-provider usage, and equality handling.

- 848c6d8: Updates selector predicate callbacks to use a data-first signature.
  - `@tdreyno/fizz`
    - `selectWhen(...)` function selectors now receive `(data, state, context)` instead of `(state, context)`.
    - This makes data predicates easier to reuse directly, including unary matchers like `isMatching(...)` from `ts-pattern`.
    - `runStateSelector(...)` now invokes selector callbacks with `state.data` as the first argument.
    - Matcher-object shorthand behavior is unchanged.

  Migration:
  - Before: `selectWhen(Editing, state => !state.data.readOnly)`
  - After: `selectWhen(Editing, (data, state) => !data.readOnly)`

## 8.3.0

### Minor Changes

- ea19e4b: Require both `resolve` and `reject` handlers for async action mapping.

  This is a breaking API change: `startAsync(...)` now requires both handler callbacks, and JSON builder `chainToAction(...)` calls must provide both resolve and reject mappers. Use explicit no-op handlers when a branch should ignore one side of the async result.

- b74dd00: Add `customJSONAsync(...)` and additional JSON pipeline stages for async flows.

  This introduces a JSON builder for client callbacks that already return parsed payloads, along with pipeline ergonomics via `map(...)` for payload transformation before action dispatch.

- 1223ce6: Add retry and shared backoff policy support to existing async helpers.

  `requestJSONAsync(...)` and `customJSONAsync(...)` now accept optional `init.retry` settings for attempts, retry predicates, and fixed or exponential backoff with optional jitter. `withRetry(...)` now uses the same shared retry policy shape, so fluent and root async retry behavior are consistent.

- 3abddb4: Add `fluentAction<P>(debugLabel?: string)` to `@tdreyno/fizz/fluent` for creator-by-reference fluent handlers without manually naming action types.
- 6535706: Add an optional `@tdreyno/fizz/fluent` entry point for chain-first state authoring.

  This introduces fluent `state(...)` helpers with creator-first responder registration, lifecycle shortcuts, scheduling responders, definition diagnostics, and utility helpers, while keeping the root object-style API unchanged.

- 514ae3e: # Breaking Change

  Replace the React-specific `useParallelMachines(...)` hook with the runtime-first `createParallelMachine(...)` shape and host it through `useMachine(...)`.

  `@tdreyno/fizz` now exports `getParallelRuntimes(...)` so React and other integrations can read the keyed child runtime map from the parent parallel machine state.

  `createParallelMachine(...)` now accepts a map of `createMachine(...)` results that already carry their own `initialState`, instead of `{ machine, initialState }` branch wrappers.

  Created machine roots now expose `.withInitialState(...)` so callers can override startup state with runtime values while reusing the same machine definition, including branch overrides in `createParallelMachine(...)`.

  This is a breaking API change in `@tdreyno/fizz-react`: callers should construct the parallel machine in core, pass `parallel.machine` and `parallel.initialState` into `useMachine(...)`, dispatch through `machine.actions`, and read branch runtimes with `getParallelRuntimes(machine.currentState.data)`.

## 8.2.0

### Minor Changes

- 9cddc3f: Add new runtime ergonomics and React subscription helpers.

  For `@tdreyno/fizz`:
  - Add test harness helpers: `settle(...)`, `waitForState(...)`, and `waitForOutput(...)` in `@tdreyno/fizz/test`.
  - Extend `waitState(...)` timeout options with an object form (`{ delay, id? }`) for scheduler-driven timeout behavior while preserving numeric timeout compatibility.
  - Export `WaitStateTimeout` from the package root.

  For `@tdreyno/fizz-react`:
  - Add `useMachineSubscription(...)` to simplify imperative runtime subscriptions with optional immediate replay via `{ emitCurrent: true }`.
  - Ensure the helper works with both `useMachine(...)` and `createMachineContext(...).useMachineContext()` return values.

## 8.1.0

### Minor Changes

- 39c2c4b: Add Mermaid output support to `fizz visualize` via `--format mermaid`, including `.mmd` default output and updated loading-machine visualization artifacts.

### Patch Changes

- 34320b6: Fix `update(...)` transition behavior so in-flight async, timer, interval, and frame work is preserved on same-state updates. If your flow previously relied on implicit cancellation during `update(...)`, call explicit cancellation helpers such as `cancelAsync(...)` instead.

## 8.0.0

### Major Changes

- 52a16e7: Remove the old `createRuntime(context, actions, outputActions, options?)` signature.

  `createRuntime(...)` now requires `createRuntime(machine, initialState, options?)`, and low-level context-based callers should construct `new Runtime(...)` directly.

  Update the React integration to use the machine-first runtime entrypoint.

- 0ff3327: Introduce a new public state-identity API on runtime states: `currentState.is(machine.states.SomeState)`.

  For `@tdreyno/fizz`:
  - Added `currentState.is(...)` on state transitions.
  - Removed the `isState(...)` export from the package root.
  - Removed `currentState.state` from the public `StateTransition` interface.

  For `@tdreyno/fizz-react`:
  - Hook/context values now expose `states`, so UI code can compare identity with `machine.currentState.is(machine.states.SomeState)`.

  Migration notes:
  - Replace `isState(currentState, SomeState)` with `currentState.is(SomeState)`.
  - Replace `currentState.state === SomeState` with `currentState.is(SomeState)`.

- c6be9c3: Add `fizz machines`, and require explicit `createMachine(...)` roots for CLI machine discovery instead of inferring machines from barrel exports.

### Minor Changes

- 5aecfb8: Add interval lifecycle actions and state helpers so `state(...)` can start, restart, and cancel repeating schedules through the runtime.
- 124270c: Add async scheduled operations with `startAsync` and `cancelAsync`, controlled async drivers for testing, direct success and failure mapping to user actions, `AsyncCancelled` for observable explicit cancellation, and a `requestJSONAsync(...).validate(...).chainToAction(...)` convenience builder for JSON request flows.
- 79377a7: <!-- markdownlint-disable-file MD041 MD012 -->

  Add requestAnimationFrame loop support with `startFrame()` and `cancelFrame()`, driven by the existing `OnFrame` action and testable through the controlled timer driver.

- 1f6a234: Add runtime console debugging helpers that format monitor events and wire them to a console-backed runtime monitor.
- 39c2944: Add built-in state timer support with typed timer lifecycle actions, timer helper effects, and a controllable runtime timer driver for tests.
- d85d87c: # Summary

  Add `whichTimeout` and `whichInterval` helper matchers, and split timer ids from interval ids in `state(...)` typing so timer and interval handlers narrow against separate unions.

- d33c279: Add the new `action("Type")` and `action("Type").withPayload<P>()` action-creator API, and deprecate `createAction` while keeping it available for backwards compatibility.
- 80c97b4: # Summary

  Add a dedicated `@tdreyno/fizz/test` entrypoint with a reusable test harness and deferred promise helper for deterministic machine tests.

- 62086f1: # Summary

  Add automatic Chrome debugger runtime registration through a page-global runtime registry so browser runtimes can appear in the DevTools panel without manual `createFizzChromeDebugger()` wiring.

  Remove the old global hook compatibility surface. `@tdreyno/fizz` no longer exports the hook key or hook types, and `@tdreyno/fizz-chrome-debugger` no longer installs or restores a global hook on the page target.

  Rename the public bridge installer surface to match the registry-based model: `installFizzChromeDebuggerHook()` and its related installed/options types are replaced by `installFizzChromeDebugger()` and matching registry-neutral type names.

- 3a30517: Add debounce and throttle helpers

### Patch Changes

- e47ab94: Tighten the core root API surface by removing `LoadingMachine`, `beforeEnter`, `stateWrapper`, and deprecated `createAction` from the `@tdreyno/fizz` root barrel.

  Fizz now bootstraps the initial state on the first `runtime.run(enter())`, so React, test helpers, and manual runtime setup no longer need a separate `beforeEnter(runtime)` call.

  Refresh the core API reference and repository skills/docs to match the cleaned-up runtime lifecycle and public exports.

## 7.1.0

### Minor Changes

- ab3a829: Tighten types

## 7.0.3

### Patch Changes

- f9d73dc: Add license to package

## 7.0.2

### Patch Changes

- 5cdd4d0: Ignore turbo files in npm package

## 7.0.1

### Patch Changes

- 64f8359: Include README in core package

## 7.0.0

### Major Changes

- 63a0efb: Node 20 now the minimum version. Add React 19 support

## 6.0.1

### Patch Changes

- 9baacf4: Turborepo + GH release test

## 6.0.0

### Major Changes

- cb9fdcf: Separate packages
