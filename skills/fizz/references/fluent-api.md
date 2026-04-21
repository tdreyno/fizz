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

Use these helpers to keep repetitive state registration patterns small and readable.
