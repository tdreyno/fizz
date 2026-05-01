# @tdreyno/fizz

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
