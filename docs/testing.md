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

Prefer asserting state identity and machine-visible data rather than internal scheduler details.

## Async Tests

Use `createControlledAsyncDriver()` whenever a state starts work through `startAsync(...)` or `requestJSONAsync(...)`.

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
- helper methods such as `run(...)`, `respondToOutput(...)`, `currentState()`, `currentHistory()`, `flushAsync()`, `advanceBy()`, `advanceFrames()`, `runAllAsync()`, `runAllTimers()`, `settle(...)`, `waitForState(...)`, and `waitForOutput(...)`
- read-only inspection helpers such as recorded outputs and recorded state snapshots

This subpath is preferred over adding test helpers to the root package export surface because it keeps production imports and test-only imports clearly separated.

## Waiting Helpers In The Harness

The harness waiting helpers remove the most common `onContextChange(...)` and `onOutput(...)` boilerplate:

- `settle(options?)` drains async completions and due timer work until no new state/output activity is observed, or until `maxIterations` is reached.
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
- [React Integration](./react-integration.md)
- [Complex Actions](./complex-actions.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [AI Skills](./ai-skills.md)
- [API](./api.md)
