# Testing

Fizz machines are easiest to test when you keep the machine pure and drive the runtime with deterministic adapters.

The current testing story in Fizz is built from the existing public runtime APIs:

- `createMachine(...)`
- `createRuntime(machine, initialState, options?)`
- `createControlledAsyncDriver()`
- `createControlledTimerDriver()`
- `runtime.onContextChange(...)`
- `runtime.onOutput(...)`

This page documents the current recommended testing workflow and the dedicated testing entrypoint built on top of it.

For React components that use `useMachine(...)`, the usual split is: test the machine behavior with the runtime patterns in this guide, then test the React component as a thin rendering layer on top. See [React Integration](./react-integration.md) for the hook API itself.

## Recommended Strategy Today

Model the machine as usual, then test it by composing the runtime with controlled drivers.

- Use plain `runtime.run(...)` for transition-only tests.
- Use `runtime.runAndSelect(...)` when one test step needs dispatch plus an immediate derived read.
- Use `createControlledAsyncDriver()` when a machine starts promise-backed work.
- Use `createControlledTimerDriver()` when a machine uses timers, intervals, or frame-based work.
- Capture state changes with `runtime.onContextChange(...)` when you need an ordered history of transitions.
- Capture output actions with `runtime.onOutput(...)` when the machine emits integration-facing events.

This keeps tests deterministic and avoids real timers, real network timing, and ad-hoc mocking around the runtime scheduler.

## Transition-Only Tests

For machines that only react to actions synchronously, the minimal pattern is:

```ts
import { createMachine, createRuntime, enter } from "@tdreyno/fizz"

const machine = createMachine({
  actions: { save },
  states: { Editing },
})
const runtime = createRuntime(machine, Editing({ events: [] }))

await runtime.run(enter())
await runtime.run(save())

expect(runtime.currentState().is(machine.states.Editing)).toBeTruthy()
expect(runtime.currentState().data.events).toEqual(["enter", "save"])
```

For teardown-sensitive tests, also assert runtime diagnostics:

- call `runtime.getDiagnosticsSnapshot()` to inspect active listeners/resources/timers/async/queues
- call `runtime.assertCleanTeardown()` after `runtime.disconnect()` for leak checks

Prefer asserting state identity and machine-visible data rather than internal scheduler details.

## Async Tests

Use `createControlledAsyncDriver()` whenever a state starts work through `startAsync(...)`, `debounceAsync(...)`, or `requestJSONAsync(...)`.

```ts
import {
  createControlledAsyncDriver,
  createMachine,
  createRuntime,
  enter,
} from "@tdreyno/fizz"

const machine = createMachine({
  actions: { profileLoaded },
  states: { Loading },
})
const asyncDriver = createControlledAsyncDriver()
const runtime = createRuntime(machine, Loading({ events: [] }), { asyncDriver })

await runtime.run(enter())

loadProfile.resolve({ id: "1", name: "Ada" })
await asyncDriver.flush()

expect(runtime.currentState().data.profileName).toBe("Ada")
```

### Deferred Promises

Fizz currently does not export a built-in `deferred()` helper, so tests usually define one locally:

```ts
type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, reject, resolve }
}
```

That local helper is the current best way to control when async work resolves or rejects.

When testing `debounceAsync(...)`, pair the deferred helper with `createControlledTimerDriver()` so both the debounce delay and the async settlement stay deterministic.

```ts
const asyncDriver = createControlledAsyncDriver()
const timerDriver = createControlledTimerDriver()
const runtime = createRuntime(machine, Editing({ events: [] }), {
  asyncDriver,
  timerDriver,
})

await runtime.run(draftChanged({ draftId: "1", text: "ab" }))
await timerDriver.advanceBy(300)
deferredSave.resolve("ok")
await asyncDriver.flush()
```

## Timer And Interval Tests

Use `createControlledTimerDriver()` when a machine uses `startTimer(...)`, `restartTimer(...)`, `startInterval(...)`, or frame work.

```ts
import {
  createControlledTimerDriver,
  createMachine,
  createRuntime,
  enter,
} from "@tdreyno/fizz"

const machine = createMachine({
  actions: { save },
  states: { Editing },
})
const timerDriver = createControlledTimerDriver()
const runtime = createRuntime(machine, Editing({ events: [] }), { timerDriver })

await runtime.run(enter())
await runtime.run(save())
await timerDriver.advanceBy(50)

expect(runtime.currentState().data.events).toContain("completed:autosave")
```

Useful control methods:

- `advanceBy(ms)` to move virtual time forward
- `advanceFrames(count, frameMs?)` to drive frame-based work
- `runAll()` to drain all scheduled timers or intervals

## Observing State And Output

Fizz already exposes the observation hooks needed for higher-level test helpers.

Use `runtime.onContextChange(...)` when a test needs every intermediate state:

```ts
const seenStates: string[] = []

runtime.onContextChange(context => {
  seenStates.push(context.currentState.name)
})
```

Use `runtime.onOutput(...)` when a test needs machine-emitted actions:

```ts
const outputs: string[] = []

runtime.onOutput(action => {
  outputs.push(action.type)
})
```

These hooks are also the basis for the dedicated testing harness described below.

## Dedicated Testing Entry Point

Fizz ships a dedicated subpath for test helpers:

```ts
import { createTestHarness, deferred } from "@tdreyno/fizz/test"
```

The goal of that entrypoint is not to add new runtime semantics. It composes the existing public pieces into one place so consumer tests do not have to repeat runtime setup, driver wiring, and observation boilerplate.

The exported shape is:

- `createTestHarness(...)` to compose context creation, runtime creation, controlled drivers, and state/output recording
- `deferred()` as a small utility for promise-controlled tests
- helper methods such as `run(...)`, `respondToOutput(...)`, `currentState()`, `currentHistory()`, `flushAsync()`, `advanceTime(...)`, `advanceTimeTo(...)`, `advanceFrames()`, `runAllAsync()`, `settle(...)`, `waitForState(...)`, and `waitForOutput(...)`
- helper methods such as `run(...)`, `respondToOutput(...)`, `currentState()`, `currentHistory()`, `flushAsync()`, `hasPendingAsync(asyncId)`, `getPendingAsync(asyncId)`, `getPendingAsyncCount()`, `advanceTime(...)`, `advanceTimeTo(...)`, `advanceFrames()`, `runAllAsync()`, `settle(...)`, `waitForState(...)`, and `waitForOutput(...)`
- resource helpers such as `resources()`, `waitForResource(key, options?)`, and `waitForResourceRelease(key, options?)`
- read-only inspection helpers such as recorded outputs and recorded state snapshots

### Async Introspection In Harness Tests

The harness exposes three inspection helpers for checking pending async work and a `flushAsync` overload for asserting the outcome.

**Checking pending state:**

```ts
await harness.run(save())

// Is work pending for this id?
expect(harness.hasPendingAsync("save")).toBe(true)

// Get the current phase
expect(harness.getPendingAsync("save")).toEqual({
  asyncId: "save",
  phase: "debouncing",
})

// Count all pending operations
expect(harness.getPendingAsyncCount()).toBe(1)
```

**Flushing a debounce and asserting the outcome:**

```ts
await harness.run(save())

// Flush the pending debounce and get the outcome
const outcome = await harness.flushAsync("save")

expect(outcome).toEqual({ type: "succeeded", value: "persisted" })
```

The two-argument form of `harness.flushAsync(asyncId, options?)` returns a `FlushAsyncOutcome`. The zero-argument form `harness.flushAsync()` is a shorthand that drives the async driver through one flush cycle without returning an outcome.

`FlushAsyncOutcome` discriminants:

- `{ type: "nothing" }`: no pending work for the id
- `{ type: "succeeded"; value: unknown }`: work resolved
- `{ type: "failed"; error: unknown }`: work rejected
- `{ type: "aborted" }`: timed out or cancelled before settling

## Disconnect And Leak Checks

When the test exercises teardown, assert the disconnect contract directly:

1. call `runtime.disconnect()`
2. call `runtime.assertCleanTeardown()`
3. if the test is about cancellation, also assert that the async helper's abort signal fired and that no follow-up actions ran

After a clean disconnect, these diagnostics buckets should usually be empty:

- `asyncOps`
- `timers`
- `listeners`
- `resources`
- `channelQueues`

Minimal abort-verification fixture:

```typescript
let aborted = false

const Loading = state({
  Enter: () =>
    customJSONAsync(
      signal =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true
              reject(new DOMException("Aborted", "AbortError"))
            },
            { once: true },
          )
        }),
    ).chainToAction(loaded, failed),
})

await runtime.run(enter())
runtime.disconnect()
await asyncDriver.flush()

expect(aborted).toBe(true)
expect(() => runtime.assertCleanTeardown()).not.toThrow()
```

### Explicit Controlled Time In Harness Tests

The harness exposes a dedicated controlled-time API so tests can assert intermediate state without framework-level fake timers.

```ts
const harness = createTestHarness({
  history: [Editing({ events: [] })],
  internalActions: { inputChanged, saveLoaded },
})

await harness.start()
await harness.run(inputChanged({ text: "a" }))
await harness.run(inputChanged({ text: "ab" }))
await harness.run(inputChanged({ text: "abc" }))

await harness.advanceTime(200, { settle: false })
expect(harness.outputs()).toHaveLength(0)

await harness.advanceTime(200)
const output = await harness.waitForOutput("SaveSucceeded")
expect(output.type).toBe("SaveSucceeded")
```

Available helpers:

- `advanceTime(ms, options?)` advances by a delta.
- `advanceTimeTo(targetMs, options?)` advances to an absolute target.
- `time.now()` returns the current controlled time.
- `time.total()` returns total advanced milliseconds since harness start.
- `time.advance(...)` and `time.advanceTo(...)` mirror the flat methods.

### Command Handlers And Clients In Harness Tests

When a machine uses `commandEffect(...)`, inject command handlers directly in the harness options.

```ts
import { commandHandlersFromClients } from "@tdreyno/fizz"
import { createTestHarness } from "@tdreyno/fizz/test"

type Commands = {
  notesEditor: {
    setDocument: {
      payload: { document: string }
      result: { saved: true }
    }
  }
}

const clients = {
  notesEditor: {
    setDocument: ({ document }: { document: string }) => ({
      saved: document.length > 0,
    }),
  },
}

const harness = createTestHarness({
  history: [Editing({ status: "idle" })],
  internalActions: { applyClicked, applySucceeded },
  clients,
  commandHandlers: commandHandlersFromClients<Commands>(clients),
  commandMissingHandler: "error",
})

await harness.run(applyClicked({ document: "Hello" }))
expect(harness.currentState().data.status).toBe("applied")
```

Use `commandMissingHandler: "error"` in tests that should fail fast when a handler is not wired. Use `"noop"` or `"warn"` when intentionally modeling missing integrations.

This subpath is preferred over adding test helpers to the root package export surface because it keeps production imports and test-only imports clearly separated.

## Browser Runtime Tests

When a machine uses `dom.listen(...)`, DOM acquisition helpers, or frame coalescing, prefer the browser-focused test subpath:

```ts
import {
  createBrowserTestHarness,
  expectCommandOrder,
  firePointerDrag,
  fireTextInput,
  flushFrames,
} from "@tdreyno/fizz/test/browser"
import { JSDOM } from "jsdom"

const testDom = new JSDOM(
  '<body><form><input name="query" /><button type="button">Save</button></form></body>',
)
const harness = createBrowserTestHarness({
  document: testDom.window.document,
  history: [Editing({ events: [] })],
  internalActions: { pointerMoved, submitted, valueChanged },
})

const inputNode = testDom.window.document.querySelector("input")
const buttonNode = testDom.window.document.querySelector("button")

if (!(inputNode instanceof testDom.window.HTMLInputElement)) {
  throw new TypeError("Expected input")
}

if (!(buttonNode instanceof testDom.window.HTMLButtonElement)) {
  throw new TypeError("Expected button")
}

await harness.start()
fireTextInput(inputNode, { value: "Ada" })
firePointerDrag(harness.document, {
  moves: [{ clientX: 8 }],
  start: { clientX: 2, target: buttonNode },
})
await flushFrames(harness, 1)

expectCommandOrder(harness, ["Submitted"])
```

The browser test subpath is intentionally test-runner agnostic:

- it accepts an explicit `document`, so tests can use Jest + jsdom, Vitest + happy-dom/jsdom, or `node:test` with a manually created DOM
- side-effect methods such as `confirm(...)` and `prompt(...)` are recorded by the harness itself rather than by `jest.fn()` or `vi.fn()`
- `expectCommandOrder(...)` throws on mismatches instead of depending on a framework matcher API

The exported browser helpers are:

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

The intended shape is:

- use `fireEvent(...)` when the event is uncommon and constructor inference is good enough
- use the typed wrappers when tests care about `key`, `clientX`, `submitter`, or similar event-specific fields
- use the sequence helpers when the test is modeling user interactions rather than isolated DOM dispatches

The returned harness extends `createTestHarness(...)` with:

- `document`
- `browserDriver`, whose effect methods expose `calls` and `mockReturnValue(...)`
- `flushFrames(...)` as a convenience alias for `advanceFrames(...)`

## Waiting Helpers In The Harness

The harness waiting helpers remove the most common `onContextChange(...)` and `onOutput(...)` boilerplate:

- `settle(options?)` drains async completions and due timer work until no new state/output activity is observed, or until `maxIterations` is reached.
- `advanceTime(ms, { settle: false })` advances by a fixed amount without a full quiescence drain.
- `waitForState(predicate, options?)` checks the predicate immediately, then retries with bounded settle cycles.
- `waitForOutput(typeOrPredicate, options?)` waits by output type or custom predicate with the same bounded retry behavior.

```ts
const harness = createTestHarness({
  history: [Loading({ events: [] })],
  internalActions: { profileLoaded },
  outputActions: { fetchProfile },
})

await harness.start()

// Wait for machine state without manual subscriptions
await harness.waitForState(state => state.is(Done))

// Wait for integration-facing output
const output = await harness.waitForOutput("FetchProfile")

expect(output.type).toBe("FetchProfile")
```

## Testing State Resources

When states use `resource(...)`, `abortController(...)`, or `subscription(...)`, use harness resource helpers to assert lifecycle without manual runtime wiring.

```ts
const harness = createTestHarness({
  history: [Editing({ events: [] })],
  internalActions: { save },
})

await harness.start()
await harness.waitForResource("sessionId")

expect(harness.resources().keys).toContain("sessionId")

await harness.run(save())
await harness.waitForResourceRelease("sessionId")

expect(harness.resources().keys).toEqual([])
```

## Testing Guidance For Agents

If you are using the Fizz AI skill, testing guidance now lives alongside the runtime references.

Agents should use the testing guidance when a task involves:

- adding or updating Fizz machine tests
- making async or timer-driven runtime behavior deterministic under test
- capturing emitted output actions in tests
- designing consumer-facing testing helpers for Fizz

## Related Docs

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Awaiting Conditions](./awaiting-conditions.md)
- [React Integration](./react-integration.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [AI Skills](./ai-skills.md)
- [API](./api.md)
