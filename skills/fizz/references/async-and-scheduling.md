# Async And Scheduling

Use this reference when the task involves promise-backed work, JSON requests, timers, intervals, animation frames, cancellation, or stale completion handling.

## Prefer Fizz Helpers Over Ad-Hoc Control Flow

Fizz already exposes the lifecycle primitives needed for async and scheduled work. Prefer those helpers over manually wiring `setTimeout`, `setInterval`, or fetch bookkeeping in components.

## `startAsync(...)`

Use `startAsync(...)` when you need to start async work from a state handler and map the settled result back into actions.

Supported patterns:

- pass a lazy async function `(signal, context) => Promise<T>`
- pass an already-created promise if that is truly what the task requires

Use an explicit `asyncId` when later cancellation matters.

```typescript
startAsync(
  loadProfile,
  {
    resolve: profileLoaded,
    reject: profileFailed,
  },
  "profile",
)
```

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
customJSONAsync(
  (signal, context) =>
    context.apiClient.getProfile({
      signal,
      userId: context.userId,
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

Choose between the JSON helpers like this:

- use `requestJSONAsync(...)` when Fizz should own fetch + response checks + json parsing
- use `customJSONAsync(...)` when the client layer already owns transport and returns parsed payloads

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
- `startFrame()`
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
  InputChanged: debounce((data, payload, { update }) => {
    return update({ ...data, draft: payload })
  }, 250),
  Save: throttle((_data, _payload, { trigger }) => {
    return trigger(Save())
  }, 1000),
})
```

## Review Heuristics

When reviewing async or scheduling code, check these first:

- Is the task using Fizz helpers instead of ad-hoc external orchestration?
- Are async ids or timer ids present where cancellation is required?
- Is the request path using `validate(...)` when payload shape matters?
- Are stale completions and cancellation treated as normal design concerns?
- Does the machine respond only to the scheduled actions it truly needs?

If the task shifts into React components, continue with `react-integration.md`.
