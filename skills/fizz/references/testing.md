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

- the current state identity via `currentState.is(machine.states.SomeState)`
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

Use `deferred()` from `@tdreyno/fizz/test` when you need explicit resolve/reject control in a test.

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

## Responding to output actions

`createTestHarness(...)` exposes `respondToOutput(...)` for integration-style tests where emitted outputs should trigger follow-up internal actions.

```typescript
const stop = harness.respondToOutput("RequestSave", payload => {
  return saveCompleted({ id: payload.id })
})

await harness.start()
await harness.run(saveRequested())

stop()
```

## Testing Entry Point

The intended direction is a dedicated test helper subpath:

- `@tdreyno/fizz/test`
- `createTestHarness(...)`
- `deferred()`
- `settle(options?)`
- `waitForState(predicate, options?)`
- `waitForOutput(typeOrPredicate, options?)`
- `respondToOutput(...)`

This is current API surface for reusable Fizz testing helpers.

## Harness Waiting Helpers

Use the harness waiting helpers when a test should pause until machine activity settles, a state appears, or an output is emitted.

- `settle({ maxIterations? })`: drains queued async and due timer work until no additional state or output activity is observed.
- `waitForState(predicate, { maxIterations?, settleBetweenChecks? })`: checks immediately, then retries with bounded settle cycles.
- `waitForOutput(typeOrPredicate, { maxIterations?, settleBetweenChecks? })`: waits by output type string or predicate with the same bounded retry behavior.

```typescript
const harness = createTestHarness({
  history: [Loading({ events: [] })],
  internalActions: { profileLoaded },
  outputActions: { fetchProfile },
})

await harness.start()
await harness.settle()
await harness.waitForState(state => state.is(Done))

const output = await harness.waitForOutput("FetchProfile")
expect(output.type).toBe("FetchProfile")
```

## Source Anchors

- `packages/fizz/src/runtime.ts`
- `packages/fizz/src/runtime/asyncDriver.ts`
- `packages/fizz/src/runtime/timerDriver.ts`
- `packages/fizz/src/__tests__/async.spec.ts`
- `packages/fizz/src/__tests__/timers.spec.ts`
- `docs/testing.md`
