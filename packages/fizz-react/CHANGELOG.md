# @tdreyno/fizz-react

## 7.4.0

### Minor Changes

- 514ae3e: # Breaking Change

  Replace the React-specific `useParallelMachines(...)` hook with the runtime-first `createParallelMachine(...)` shape and host it through `useMachine(...)`.

  `@tdreyno/fizz` now exports `getParallelRuntimes(...)` so React and other integrations can read the keyed child runtime map from the parent parallel machine state.

  `createParallelMachine(...)` now accepts a map of `createMachine(...)` results that already carry their own `initialState`, instead of `{ machine, initialState }` branch wrappers.

  Created machine roots now expose `.withInitialState(...)` so callers can override startup state with runtime values while reusing the same machine definition, including branch overrides in `createParallelMachine(...)`.

  This is a breaking API change in `@tdreyno/fizz-react`: callers should construct the parallel machine in core, pass `parallel.machine` and `parallel.initialState` into `useMachine(...)`, dispatch through `machine.actions`, and read branch runtimes with `getParallelRuntimes(machine.currentState.data)`.

### Patch Changes

- Updated dependencies [ea19e4b]
- Updated dependencies [b74dd00]
- Updated dependencies [1223ce6]
- Updated dependencies [3abddb4]
- Updated dependencies [6535706]
- Updated dependencies [514ae3e]
  - @tdreyno/fizz@8.3.0

## 7.3.0

### Minor Changes

- 9cddc3f: Add new runtime ergonomics and React subscription helpers.

  For `@tdreyno/fizz`:
  - Add test harness helpers: `settle(...)`, `waitForState(...)`, and `waitForOutput(...)` in `@tdreyno/fizz/test`.
  - Extend `waitState(...)` timeout options with an object form (`{ delay, id? }`) for scheduler-driven timeout behavior while preserving numeric timeout compatibility.
  - Export `WaitStateTimeout` from the package root.

  For `@tdreyno/fizz-react`:
  - Add `useMachineSubscription(...)` to simplify imperative runtime subscriptions with optional immediate replay via `{ emitCurrent: true }`.
  - Ensure the helper works with both `useMachine(...)` and `createMachineContext(...).useMachineContext()` return values.

### Patch Changes

- Updated dependencies [9cddc3f]
  - @tdreyno/fizz@8.2.0

## 7.2.0

### Minor Changes

- 8af4e47: Add `createMachineContext(...)` so React components can share one machine runtime through a typed Provider and consumer hook.
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

### Patch Changes

- 52a16e7: Remove the old `createRuntime(context, actions, outputActions, options?)` signature.

  `createRuntime(...)` now requires `createRuntime(machine, initialState, options?)`, and low-level context-based callers should construct `new Runtime(...)` directly.

  Update the React integration to use the machine-first runtime entrypoint.

- e47ab94: Tighten the core root API surface by removing `LoadingMachine`, `beforeEnter`, `stateWrapper`, and deprecated `createAction` from the `@tdreyno/fizz` root barrel.

  Fizz now bootstraps the initial state on the first `runtime.run(enter())`, so React, test helpers, and manual runtime setup no longer need a separate `beforeEnter(runtime)` call.

  Refresh the core API reference and repository skills/docs to match the cleaned-up runtime lifecycle and public exports.

- Updated dependencies [5aecfb8]
- Updated dependencies [124270c]
- Updated dependencies [79377a7]
- Updated dependencies [52a16e7]
- Updated dependencies [1f6a234]
- Updated dependencies [39c2944]
- Updated dependencies [0ff3327]
- Updated dependencies [d85d87c]
- Updated dependencies [e47ab94]
- Updated dependencies [d33c279]
- Updated dependencies [80c97b4]
- Updated dependencies [62086f1]
- Updated dependencies [3a30517]
- Updated dependencies [c6be9c3]
  - @tdreyno/fizz@8.0.0

## 7.1.0

### Minor Changes

- ab3a829: Tighten types

### Patch Changes

- 8f2c70a: Fix peerDeps range for react
- Updated dependencies [ab3a829]
  - @tdreyno/fizz@7.1.0

## 7.0.2

### Patch Changes

- f9d73dc: Add license to package
- Updated dependencies [f9d73dc]
  - @tdreyno/fizz@7.0.3

## 7.0.1

### Patch Changes

- 5cdd4d0: Ignore turbo files in npm package
- Updated dependencies [5cdd4d0]
  - @tdreyno/fizz@7.0.2

## 7.0.0

### Major Changes

- 63a0efb: Node 20 now the minimum version. Add React 19 support

### Patch Changes

- Updated dependencies [63a0efb]
  - @tdreyno/fizz@7.0.0

## 6.0.1

### Patch Changes

- 9baacf4: Turborepo + GH release test
- Updated dependencies [9baacf4]
  - @tdreyno/fizz@6.0.1

## 6.0.0

### Major Changes

- cb9fdcf: Separate packages

### Patch Changes

- Updated dependencies [cb9fdcf]
  - @tdreyno/fizz@6.0.0
