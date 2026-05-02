# Store Sync Adapter

Apps that integrate Fizz with an external store often write the same subscription glue repeatedly: subscribe, read the current value, compare it to the previous value, and dispatch a Fizz action only when something changed. Each subscription needs its own closure variable for deduplication, and when a machine handler writes back to the store it can trigger the subscription again, creating a ping-pong loop.

`connectExternalSnapshot` provides a standard way to wire an external store into a Fizz runtime that handles distinct-until-changed and loop prevention out of the box.

## Basic Usage

```typescript
import { connectExternalSnapshot } from "@tdreyno/fizz"

type AppState = {
  viewportMode: "mobile" | "desktop"
  currentPage: string
}

const ViewportModeChanged = action("ViewportModeChanged").withPayload<
  "mobile" | "desktop"
>()

const disconnect = connectExternalSnapshot({
  runtime,
  subscribe: onChange => appStore.subscribe(onChange),
  read: () => appStore.getState(),
  select: state => state.viewportMode,
  toAction: ViewportModeChanged,
})

// later
disconnect()
```

The adapter subscribes to the store, selects the relevant slice, and dispatches `ViewportModeChanged` only when the selected value changes. It cleans itself up when you call `disconnect()` or when the runtime disconnects.

## Options

| Option        | Type                                      | Default     | Description                                                                                 |
| ------------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `runtime`     | `Runtime<any, any>`                       | required    | The Fizz runtime to dispatch actions into                                                   |
| `subscribe`   | `(onChange: () => void) => () => void`    | required    | Store subscription function; must return an unsubscribe fn                                  |
| `read`        | `() => StoreState`                        | required    | Read the current store state                                                                |
| `select`      | `(state: StoreState) => Snapshot`         | required    | Extract the relevant slice from store state                                                 |
| `toAction`    | `(snapshot: Snapshot) => RuntimeAction`   | required    | Map the snapshot to a Fizz action                                                           |
| `equality`    | `(a: Snapshot, b: Snapshot) => boolean`   | `Object.is` | Return `true` to suppress dispatch when the snapshot has not meaningfully changed           |
| `loopGuard`   | `{ key: (snapshot: Snapshot) => string }` | none        | Suppresses re-dispatch when the new snapshot's key matches the most recently dispatched key |
| `emitInitial` | `boolean`                                 | `false`     | When `true`, dispatch immediately with the current snapshot on init                         |

## Distinct-Until-Changed

By default, `Object.is` is used for equality. For object snapshots you should provide your own comparison:

```typescript
connectExternalSnapshot({
  runtime,
  subscribe: onChange => store.subscribe(onChange),
  read: () => store.getState(),
  select: state => ({
    viewportMode: state.viewportMode,
    currentPage: state.currentPage,
  }),
  toAction: ShellStateChanged,
  equality: (a, b) =>
    a.viewportMode === b.viewportMode && a.currentPage === b.currentPage,
})
```

Fizz does not bundle a `shallowEqual` helper. You can use one from a library or write a focused equality function as shown above.

## emitInitial

When `emitInitial` is `false` (default), the adapter primes its internal dedup state from the current store value without dispatching. This prevents an extra action on startup when the machine already has the right initial state.

When `emitInitial` is `true`, the adapter dispatches immediately with the current snapshot, which is useful when the machine needs to receive the first value to begin its work.

## Loop Guard

If a machine handler writes back to the external store (for example via a command effect), that write will trigger the store subscription again with a value the machine already knows about, creating a feedback loop.

The `loopGuard` option suppresses re-dispatch when the new snapshot has the same key as the most recently dispatched one:

```typescript
connectExternalSnapshot({
  runtime,
  subscribe: onChange => store.subscribe(onChange),
  read: () => store.getState(),
  select: state => state.documentId,
  toAction: DocumentSelected,
  loopGuard: { key: id => id },
})
```

When the machine handler writes `documentId` back to the store, the subscription fires with the same `id`. The loop guard sees that key `"abc"` was the last dispatched key and suppresses the action.

## Lifecycle

The adapter automatically unsubscribes from the store when `runtime.disconnect()` is called, so you do not need to keep track of the disconnect function when runtime teardown already covers the full lifecycle.

```typescript
connectExternalSnapshot({ runtime, ... })

// runtime.disconnect() cleans up the store subscription too
runtime.disconnect()
```

## Return Value

`connectExternalSnapshot` returns a `() => void` disconnect function that unsubscribes from the store immediately. Use it when you need to stop listening before the runtime is disconnected.

## Related Docs

- [Output Actions](output-actions.md) — for dispatching Fizz actions back out to the external world
- [State Resources](resources.md) — for managing subscriptions inside a state lifecycle
- [Dispatch and Read](dispatch-and-read.md) — for dispatching actions and reading state from outside a machine
