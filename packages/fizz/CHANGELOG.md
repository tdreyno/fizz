# @tdreyno/fizz

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
