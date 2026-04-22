# Fluent API

`@tdreyno/fizz/fluent` provides an optional chain-first state authoring style for teams that prefer fluent registration over object literals.

The core root API remains unchanged. This page documents the alternative authoring style only.

## Import

```ts
import { state } from "@tdreyno/fizz/fluent"
```

## Shape

Create a named state and chain responders directly:

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

`on(...)` accepts action creator references only. The payload type is inferred from the creator.

Use `fluentAction(...)` when you want a creator reference without defining an explicit action name:

```ts
import { fluentAction, state } from "@tdreyno/fizz/fluent"

const increment = fluentAction<number>("increment")
const reset = fluentAction<void>()

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

`fluentAction<P>(debugLabel?: string)` uses `P` for payload typing and generates a unique internal action type for runtime routing.

## Scheduling

Use first-class timeout and interval responders:

```ts
const Polling = state<{ events: string[] }>("Polling")
  .onTimeout("autosave", (data, _payload, { update }) =>
    update({
      ...data,
      events: [...data.events, "autosave"],
    }),
  )
  .onInterval("heartbeat", (data, _payload, { update }) =>
    update({
      ...data,
      events: [...data.events, "heartbeat"],
    }),
  )
```

## Guards

Chain `when(...)` or `unless(...)` after a responder to gate execution:

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

## Introspection

Use `describe()` to inspect registration metadata for debugging and docs tooling:

```ts
const summary = Editing.describe()
// { name, actionTypes, timeoutIds, intervalIds }
```

## Helpers

`@tdreyno/fizz/fluent` also exports optional helpers:

- `withDebouncedAction(...)`
- `withRetry(...)`
- `withOptimisticUpdate(...)`
- `describeState(...)`
- `fluentAction(...)`

### `withRetry(...)`

`withRetry(...)` wraps an async function with retry behavior:

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

`withRetry(...)` supports the same retry policy shape used by JSON async helpers in the root package.

## Positioning

- Use root `@tdreyno/fizz` object-style `state(...)` when map-style definitions are clearer for your team.
- Use `@tdreyno/fizz/fluent` when chain readability and creator-first responder registration fit your workflow better.

Both approaches compile to the same runtime state behavior.

## Related Docs

- [API Documentation](./api.md)
- [Complex Actions](./complex-actions.md)
- [Nested State Machines](./nested-state-machines.md)
- [React Integration](./react-integration.md)
