# Testing Fizz Machines

Use this reference when the task is about writing, refactoring, or reviewing tests for `@tdreyno/fizz` machines.

## Core Principle

Keep machine behavior deterministic under test by controlling the runtime instead of mocking around it.

Prefer these building blocks:

- `createInitialContext(...)`
- `createRuntime(...)`
- `createControlledAsyncDriver()`
- `createControlledTimerDriver()`
- `runtime.onContextChange(...)`
- `runtime.onOutput(...)`

## What To Assert

Prefer assertions against:

- the current state identity via `isState(...)`
- the machine-visible state data
- emitted output actions
- ordered intermediate states when the sequence matters

Avoid centering tests on private runtime details that consumers cannot rely on.

## Transition Tests

For synchronous machines, create the initial context, create the runtime, run the actions, and assert the resulting state.

## Async Tests

When a state uses `startAsync(...)` or `requestJSONAsync(...)`:

1. Create a controlled async driver.
2. Pass it to `createRuntime(...)`.
3. Start the machine.
4. Resolve or reject the controlled promise.
5. Call `await asyncDriver.flush()`.
6. Assert the resulting machine state.

Use a local `deferred()` helper if the repository does not yet export one.

## Timer, Interval, And Frame Tests

When a state uses timers or intervals:

1. Create a controlled timer driver.
2. Pass it to `createRuntime(...)`.
3. Start the machine.
4. Drive time with `advanceBy(...)`, `advanceFrames(...)`, or `runAll()`.
5. Assert the resulting machine state.

## Observing Output And Intermediate States

Use `runtime.onOutput(...)` to record integration-facing actions.

Use `runtime.onContextChange(...)` to record state transitions or snapshots.

These are the primitives that the dedicated `@tdreyno/fizz/test` subpath builds on top of.

## Testing Entry Point

The intended direction is a dedicated test helper subpath:

- `@tdreyno/fizz/test`
- `createTestHarness(...)`
- `deferred()`
- `respondToOutput(...)`

This is current API surface for reusable Fizz testing helpers.

## Source Anchors

- `packages/fizz/src/runtime.ts`
- `packages/fizz/src/runtime/asyncDriver.ts`
- `packages/fizz/src/runtime/timerDriver.ts`
- `packages/fizz/src/__tests__/async.spec.ts`
- `packages/fizz/src/__tests__/timers.spec.ts`
- `docs/testing.md`
