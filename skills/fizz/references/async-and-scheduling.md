# Async And Scheduling

Use this reference when the task involves promise-backed work, JSON requests, timers, intervals, animation frames, cancellation, or stale completion handling.

For machine-scoped service dependency patterns, use `references/data-clients.md`.

## Prefer Fizz Helpers Over Ad-Hoc Control Flow

Fizz already exposes the lifecycle primitives needed for async and scheduled work. Prefer those helpers over manually wiring `setTimeout`, `setInterval`, or fetch bookkeeping in components.

When a helper needs to map success or failure back into actions, prefer fluent chaining such as `.chainToAction(...)` over inline `resolve`/`reject` config keys.

`startAsync(...)`, `debounceAsync(...)`, `requestJSONAsync(...)`, and `customJSONAsync(...)` also support `.match({ ok, err?, cancelled? })` for named outcome handlers.

```typescript
startAsync(loadProfile, "profile").match({
  cancelled: () => profileCancelled(),
  err: profileFailed,
  ok: profileLoaded,
})
```

Use `cancelled` when the machine must react to explicit cancellation or aborts beyond the built-in `AsyncCancelled` scheduled action.

When resolved payloads are discriminated unions, use `matchOn(...)` as the resolve handler. It keeps case mapping exhaustive and reusable while still using `.chainToAction(...)`.

```typescript
startAsync(loadSaveResult, "save").chainToAction(
  matchOn(result => result.kind, {
    aborted: () => saveAborted(),
    invalid: result => saveInvalid(result.reason),
    saved: result => saveSucceeded(result.revision),
    skipped: () => undefined,
  }),
  saveFailed,
)
```

`matchOn(...)` returns a normal `(value) => action | undefined` function, so it works with `startAsync(...)`, `debounceAsync(...)`, `requestJSONAsync(...)`, `customJSONAsync(...)`, and resource bridge chaining.

For controller code that needs to "dispatch and await an outcome" (e.g., wait for a state to be reached or an output to be emitted), prefer `runtime.runUntil(action, matcher, options?)` over manually wiring `onOutput`, captured resolvers, and `AbortController`. Use the standalone `runtime.waitUntil(...)` family when the wait is independent from a dispatch. Matchers come from `matchState`, `matchOutput`, and `matchAny`. Options support `signal`, `timeout`, and `includeCurrent`. See `docs/awaiting-conditions.md` for the public surface.

## `startAsync(...)`

Use `startAsync(...)` when you need to start async work from a state handler and map the settled result back into actions.

Supported patterns:

- pass a lazy async function `(signal, context) => Promise<T>`
- pass an already-created promise if that is truly what the task requires

Use an explicit `asyncId` when later cancellation matters.

```typescript
startAsync(loadProfile, "profile").chainToAction(profileLoaded, profileFailed)
```

## `debounceAsync(...)`

Use `debounceAsync(...)` when an action burst should collapse into one latest-wins async request.

Current v1 behavior from `packages/fizz/src/effect.ts`, `packages/fizz/src/runtime/runtimeAsyncModule.ts`, and async tests:

- requires a lazy run function `(signal, context) => Promise<T>`
- requires `asyncId`
- requires `delayMs`
- maps success through `resolve`
- optionally maps non-abort failures through `reject`
- automatically cancels an older in-flight request when newer work with the same `asyncId` is scheduled
- lets `cancelAsync(asyncId)` cancel both pending debounce timers and active async work
- ignores stale completions automatically
- treats abort-like failures as non-errors for `reject` mapping by default

Use it for autosave, incremental search, and other workflows that currently combine debounce plus `startAsync(...)` plus stale guards manually.

```typescript
debounceAsync(signal => saveDraft(signal, payload.text), {
  asyncId: `draft:${payload.id}`,
  delayMs: 300,
}).chainToAction(saveSucceeded, saveFailed)
```

Current option shape:

```typescript
type DebounceAsyncOptions<AsyncId extends string> = {
  asyncId: AsyncId
  delayMs: number
  classifyAbort?: (reason: unknown, signal: AbortSignal) => boolean
  emitCancelled?: boolean
}
```

Review guidance:

- prefer `debounceAsync(...)` over ad-hoc timer plus async glue for latest-wins request flows
- keep `asyncId` stable for the intended cancellation domain
- do not pass an already-created promise; the run must stay lazy
- if a task needs queueing, leading-edge behavior, or last-success caching, note that those are not part of this helper yet

For harness-based tests, pair debounced workflows with controlled-time helpers:

```typescript
await harness.advanceTime(200, { settle: false })
expect(harness.outputs()).toHaveLength(0)

await harness.advanceTime(200)
const output = await harness.waitForOutput("SaveSucceeded")
expect(output.type).toBe("SaveSucceeded")
```

This keeps debounce timing deterministic without mixing in framework fake-timer APIs.

## `requestJSONAsync(...)`

Use `requestJSONAsync(...)` for JSON request flows handled by Fizz.

Key behavior from `packages/fizz/src/effect.ts` and async tests:

- it forces `Accept: application/json`
- it merges the runtime abort signal with any provided `signal`
- it rejects when `response.ok` is false
- it parses `response.json()` internally
- it can run as a bare effect or chain directly to actions
- it supports optional retry/backoff through `init.retry`

### Current builder flow

The current API is:

- `requestJSONAsync(input, init?)`
- optional `.validate(validator)` once
- optional `.map(mapper)`
- optional `.chainToAction(resolve, reject?)`

Use `validate(...)` when the payload must be checked or narrowed before action dispatch.
Use parser-shaped validators (for example `zod` `.parse(...)`) with `validate(...)` when they return typed values.
Use `map(...)` when the payload should be transformed before dispatching actions.

```typescript
requestJSONAsync("/api/profile", { asyncId: "profile" })
  .validate(assertProfile)
  .chainToAction(profileLoaded, profileFailed)
```

Retry option shape:

```typescript
type RetryPolicy = {
  attempts?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  random?: () => number
  strategy?:
    | {
        kind: "fixed"
        delayMs: number
        jitter?: { kind: "full"; ratio?: number }
      }
    | {
        kind: "exponential"
        baseDelayMs: number
        maxDelayMs?: number
        jitter?: { kind: "full"; ratio?: number }
      }
}
```

Notes:

- For `requestJSONAsync(...)` and `customJSONAsync(...)`, retry is opt-in.
- When `retry` is provided and `attempts` is omitted, retries default to 3 attempts.
- Use `random` in tests when deterministic jitter values are required.

A validator may throw. If it throws, that thrown value is passed through to the reject handler unchanged.

## `customJSONAsync(...)`

Use `customJSONAsync(...)` when the app already has a client layer that returns parsed payloads.

Key behavior:

- it accepts a lazy client run function `(signal, context) => Promise<unknown>`
- it supports the same `validate(...)` and `chainToAction(...)` builder flow as `requestJSONAsync(...)`
- it supports optional `asyncId` for explicit cancellation with `cancelAsync(asyncId)`
- validator-thrown values are passed to reject handlers unchanged
- it supports optional retry/backoff through `init.retry`

```typescript
const userId = "user-1"

customJSONAsync(
  signal =>
    clients.apiClient.getProfile({
      signal,
      userId,
    }),
  {
    asyncId: "profile",
    retry: {
      attempts: 3,
      strategy: {
        kind: "fixed",
        delayMs: 150,
      },
    },
  },
)
  .validate(assertProfile)
  .map(profile => profile.id)
  .chainToAction(profileLoaded, profileFailed)
```

In state handlers, prefer closing over `utils.clients` for service access:

```typescript
Enter: (data, _, { clients }) =>
  customJSONAsync(signal =>
    clients.apiClient.getProfile({
      signal,
      userId: data.userId,
    }),
  ).chainToAction(profileLoaded, profileFailed)
```

Choose between the JSON helpers like this:

- use `requestJSONAsync(...)` when Fizz should own fetch + response checks + json parsing
- use `customJSONAsync(...)` when the client layer already owns transport and returns parsed payloads

## `disconnect()` async teardown

Treat `runtime.disconnect()` as full async teardown for the runtime.

Current behavior pinned by `packages/fizz/src/__tests__/runtimeDisconnectAsync.spec.ts`:

- pending `debounceAsync(...)` timers are cleared before they fire
- in-flight `startAsync(...)`, `debounceAsync(...)`, `requestJSONAsync(...)`, and `customJSONAsync(...)` work has its abort signal fired
- post-disconnect completions are discarded, so no further resolve or reject action dispatch happens
- pending waits reject with `RuntimeDisconnectedError`

Review guidance:

- if a close path must finish the latest autosave first, call `runtime.flushAsync(asyncId, { timeoutMs })` before `runtime.disconnect()`
- if work must outlive the runtime, do not keep it inside a Fizz-managed async helper
- for `requestJSONAsync(...)`, document abort as browser-side best effort because the server may already have seen the request

## Bare async effects vs action chaining

Use bare async effects when the request should happen but no follow-up action is needed.

Use `.chainToAction(...)` when the settled value should feed back into the machine as an action.

If the task is about UI behavior after success or failure, action chaining is usually the better default.

## `waitState(...)` timeout forms

`waitState(...)` supports a timeout option that can be either a number or an object form.

- `timeout: number`
  - schedules timeout with `setTimeout(...)`
- `timeout: { delay: number, id?: string }`
  - schedules timeout through Fizz timer scheduling
  - allows a stable timeout id for matching and control

The exported timeout type is `WaitStateTimeout`.

```typescript
import { waitState, type WaitStateTimeout } from "@tdreyno/fizz"

const timeout: WaitStateTimeout = {
  delay: 1500,
  id: "wait-profile",
}

const WaitForProfile = waitState(
  fetchProfile,
  profileLoaded,
  (data, payload, { update }) =>
    update({
      ...data,
      profileName: payload.name,
    }),
  {
    name: "WaitForProfile",
    timeout,
  },
)
```

## Cancellation

Use `cancelAsync(asyncId)` when a machine should actively cancel in-flight work.

Design for `AsyncCancelled` only when the state needs to observe that cancellation and update state data in response.

Important runtime behavior:

- explicit cancellation dispatches `AsyncCancelled`
- `cancelAsync(asyncId)` also cancels pending `debounceAsync(...)` timers for that same id
- stale completions are ignored
- abort-style rejections should not be treated as normal failures
- state exit can invalidate work started by that state instance

## Timers, intervals, and frames

Fizz exposes scheduling helpers through state utils and effect helpers:

- `startTimer(timeoutId, delay)`
- `cancelTimer(timeoutId)`
- `restartTimer(timeoutId, delay)`
- `startInterval(intervalId, delay)`
- `cancelInterval(intervalId)`
- `restartInterval(intervalId, delay)`
- `startFrame()` — fires `OnFrame` **once** (one-shot)
- `startFrameLoop()` — fires `OnFrame` repeatedly until `cancelFrame()` is called
- `cancelFrame()`

Use explicit ids when later restart or cancellation matters.

Model scheduled callbacks through their corresponding Fizz actions instead of reaching around the runtime.

## `debounce(...)` and `throttle(...)`

Use `debounce(...)` and `throttle(...)` to wrap individual state handlers when an action can fire frequently and machine work should be rate-limited.

- `debounce(handler, delayOrOptions)`:
  - waits until calls stop for the configured delay
  - short form: `debounce(handler, 300)`
  - object form: `debounce(handler, { delay: 300 })`
- `throttle(handler, delayOrOptions)`:
  - runs at most once per configured window
  - short form: `throttle(handler, 1000)`
  - object form supports `leading` and `trailing` behavior

Use `debounce(...)` when only the final event burst should apply, and `throttle(...)` when periodic progress should still run during bursts.

```typescript
import { action, debounce, state, throttle } from "@tdreyno/fizz"

const InputChanged = action("InputChanged").withPayload<string>()
const Save = action("Save")

const Editing = state<
  ReturnType<typeof InputChanged> | ReturnType<typeof Save>
>({
  InputChanged: debounce((data, payload) => {
    return { ...data, draft: payload }
  }, 250),
  Save: throttle((_data, _payload, { trigger }) => {
    return trigger(Save())
  }, 1000),
})
```

## Async Introspection and Flush

Four runtime methods let you observe and control pending async work from outside the state machine.

```typescript
// Check if any work is pending for this asyncId (debouncing or in-flight)
runtime.hasPendingAsync("save") // boolean

// Get the current phase of pending work
runtime.getPendingAsync("save")
// { asyncId: "save", phase: "debouncing" | "in-flight" } | undefined

// Count all pending operations
runtime.getPendingAsyncCount() // number

// Flush a pending debounce immediately (skip the delay) or await in-flight work
const outcome = await runtime.flushAsync("save")
// { type: "nothing" | "succeeded" | "failed" | "aborted" }
```

`flushAsync` use cases:

- **Immediate commit on user action**: when a user presses a final Submit or navigates away, flush any pending autosave debounce and wait for the result before proceeding
- **Programmatic drain in tests**: flush and assert the outcome without relying on timer advancement
- **Timeout guard**: pass `timeoutMs` to resolve `{ type: "aborted" }` if the operation does not settle in time

`FlushAsyncOutcome` discriminants:

- `{ type: "nothing" }` — no pending work for the id
- `{ type: "succeeded"; value: unknown }` — work resolved
- `{ type: "failed"; error: unknown }` — work rejected
- `{ type: "aborted" }` — timed out or cancelled before settling

Harness equivalents (`@tdreyno/fizz/test`): `hasPendingAsync(asyncId)`, `getPendingAsync(asyncId)`, `getPendingAsyncCount()`, and `flushAsync(asyncId, options?)`. The zero-argument harness `flushAsync()` is the no-outcome driver flush shorthand.

## Review Heuristics

When reviewing async or scheduling code, check these first:

- Is the task using Fizz helpers instead of ad-hoc external orchestration?
- Are async ids or timer ids present where cancellation is required?
- Is the request path using `validate(...)` when payload shape matters?
- Are stale completions and cancellation treated as normal design concerns?
- Does the machine respond only to the scheduled actions it truly needs?

If the task shifts into React components, continue with `react-integration.md`.
