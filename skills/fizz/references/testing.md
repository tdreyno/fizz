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

For teardown-sensitive scenarios, also assert runtime diagnostics:

- call `runtime.getDiagnosticsSnapshot()` to inspect active listeners/resources/timers/async operations/channel queues
- call `runtime.assertCleanTeardown()` after `runtime.disconnect()` to fail fast on leaked runtime work

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
- `resources()`
- `waitForResource(key, options?)`
- `waitForResourceRelease(key, options?)`

This is current API surface for reusable Fizz testing helpers.

## Browser Testing Entry Point

Use `@tdreyno/fizz/test/browser` when a machine depends on `dom.listen(...)`, DOM acquisition, or animation-frame coalescing.

Exports:

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

The browser harness extends the base test harness with:

- `document`
- `browserDriver`
- `flushFrames(...)`

`browserDriver` uses framework-agnostic recorded methods for browser side effects such as `confirm(...)`, `prompt(...)`, and `copyToClipboard(...)`.

Each recorded method exposes:

- `calls`
- `mockReturnValue(value)`
- `reset()`

This keeps the helper portable across Jest, Vitest, and `node:test` without relying on `jest.fn()` or `vi.fn()`.

Recommended usage:

- use `fireEvent(...)` for uncommon DOM events where constructor inference is sufficient
- use the typed wrappers when tests need event-specific fields like `key`, `clientX`, or `submitter`
- use `firePointerDrag(...)`, `fireTextInput(...)`, and `fireFormSubmit(...)` when the test is modeling higher-level user interactions

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

## Testing Custom State Resources

Use harness resource helpers to verify resource registration and automatic cleanup.

```ts
await harness.start()
await harness.waitForResource("sessionId")

expect(harness.resources().keys).toContain("sessionId")

await harness.run(done())
await harness.waitForResourceRelease("sessionId")

expect(harness.resources().keys).toEqual([])
```

## Source Anchors

- `packages/fizz/src/runtime.ts`
- `packages/fizz/src/runtime/asyncDriver.ts`
- `packages/fizz/src/runtime/timerDriver.ts`
- `packages/fizz/src/test.browser.ts`
- `packages/fizz/src/__tests__/async.spec.ts`
- `packages/fizz/src/__tests__/timers.spec.ts`
- `packages/fizz/src/__tests__/testBrowserHarness.spec.ts`
- `docs/testing.md`
