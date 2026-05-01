# Fluent API Reference

Use this reference when a task explicitly asks for chain-first state authoring with `@tdreyno/fizz/fluent`.

## Import

```ts
import { state } from "@tdreyno/fizz/fluent"
```

## Authoring Pattern

```ts
const Editing = state<{ name: string }>("Editing")
  .onEnter((data, _, { update }) => update(data))
  .on(setName, (data, payload, { update }) =>
    update({
      ...data,
      name: payload.name,
    }),
  )
```

Guidance:

- Prefer action creator references with `.on(...)`.
- Keep handlers deterministic and return transitions/actions/effects.
- Use `onEnter(...)` and `onExit(...)` for lifecycle responders.

## Typed Resources With `withResources(...)`

Use `withResources<Resources>()` to strongly type `utils.resources` across fluent handlers.

```ts
type Resources = {
  ac: AbortController
  sessionId: string
}

const Editing = state<{ name: string }>("Editing")
  .withResources<Resources>()
  .onEnter(() => [
    abortController("ac"),
    resource("sessionId", crypto.randomUUID()),
  ])
  .on(save, (data, payload, { resources, update }) => {
    resources.ac.abort()

    return update({
      ...data,
      name: `${payload}:${resources.sessionId}`,
    })
  })
```

If you want fluent creator references without manually naming action types, use `action<P>(debugLabel?: string)`:

```ts
const increment = action<number>("increment")
const reset = action<void>()

const Counting = state<{ count: number }>("Counting")
  .on(increment, (data, payload, { update }) =>
    update({
      ...data,
      count: data.count + payload,
    }),
  )
  .on(reset, (_data, _payload, { update }) =>
    update({
      count: 0,
    }),
  )
```

## Scheduling

```ts
const Polling = state<{ logs: string[] }>("Polling")
  .onTimeout("autosave", (data, _payload, { update }) =>
    update({
      ...data,
      logs: [...data.logs, "autosave"],
    }),
  )
  .onInterval("heartbeat", (data, _payload, { update }) =>
    update({
      ...data,
      logs: [...data.logs, "heartbeat"],
    }),
  )
```

## Guards

```ts
const Counting = state<{ count: number; enabled: boolean }>("Counting")
  .on(increment, (data, _, { update }) =>
    update({
      ...data,
      count: data.count + 1,
    }),
  )
  .when(data => data.enabled)
```

`when(...)` and `unless(...)` apply to the most recently registered responder.

## Diagnostics and Introspection

- Duplicate handler registrations throw definition errors with state/action metadata.
- Use `describe()` (or `describeState(...)`) to inspect action types and scheduled ids.

## Helper Exports

- `withDebouncedAction(...)`
- `withRetry(...)`
- `withOptimisticUpdate(...)`
- `describeState(...)`
- `action(...)`

Use these helpers to keep repetitive state registration patterns small and readable.

### `withRetry(...)` policy

`withRetry(...)` accepts retry/backoff options that match the JSON async helper retry policy.

```ts
const run = withRetry(fetchProfile, {
  attempts: 4,
  shouldRetry: (error, attempt) => {
    if (!(error instanceof Error)) {
      return false
    }

    return /429|503|timeout|network/i.test(error.message) && attempt < 4
  },
  strategy: {
    kind: "exponential",
    baseDelayMs: 200,
    maxDelayMs: 2000,
    jitter: {
      kind: "full",
      ratio: 0.2,
    },
  },
})
```
