# Store Sync Adapter

Use this reference when the task involves wiring an external store (Redux, Zustand, custom observable, etc.) into a Fizz runtime action stream.

## Export Surface

```typescript
import {
  connectExternalSnapshot,
  type ConnectExternalSnapshotOptions,
} from "@tdreyno/fizz"
```

## API

### `connectExternalSnapshot<StoreState, Snapshot>(options): () => void`

Subscribes to an external store, selects a snapshot slice, and dispatches a Fizz action whenever the snapshot changes. Returns a disconnect function.

#### `ConnectExternalSnapshotOptions<StoreState, Snapshot>`

| Field         | Type                                      | Default     | Description                                                                             |
| ------------- | ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `runtime`     | `Runtime<any, any>`                       | required    | The Fizz runtime to dispatch actions into                                               |
| `subscribe`   | `(onChange: () => void) => () => void`    | required    | Store subscription function; must return an unsubscribe fn                              |
| `read`        | `() => StoreState`                        | required    | Read current store state synchronously                                                  |
| `select`      | `(state: StoreState) => Snapshot`         | required    | Extract the relevant slice from store state                                             |
| `toAction`    | `(snapshot: Snapshot) => RuntimeAction`   | required    | Map the snapshot to a Fizz action                                                       |
| `equality`    | `(a: Snapshot, b: Snapshot) => boolean`   | `Object.is` | Return `true` to suppress dispatch when snapshot hasn't meaningfully changed            |
| `loopGuard`   | `{ key: (snapshot: Snapshot) => string }` | none        | Suppress re-dispatch when the new snapshot key matches the most recently dispatched key |
| `emitInitial` | `boolean`                                 | `false`     | When `true`, dispatch immediately on init with the current snapshot                     |

## Semantics

### Distinct-Until-Changed

On every store notification, the adapter runs `equality(lastSnapshot, nextSnapshot)`. If `true`, the dispatch is skipped. The default `Object.is` works for primitives; for object snapshots, provide a focused equality function. Fizz does not bundle a `shallowEqual` helper — bring your own.

### emitInitial Behavior

- `false` (default): reads the current snapshot, primes internal dedup state, does **not** dispatch. Prevents a redundant action at startup when the machine already has the correct initial state.
- `true`: dispatches immediately on init with the current snapshot.

### Loop Guard

Prevents machine-writes-back-to-store ping-pong. When `loopGuard` is set, the adapter tracks the key of the most recently dispatched snapshot. If the next change produces the same key, the dispatch is suppressed and the key is **not** updated. This means a subsequent change with a different key will still dispatch normally.

Example scenario without loop guard:

1. Machine transitions and writes `documentId = "abc"` to store
2. Store subscription fires with `documentId = "abc"`
3. Machine dispatches `DocumentSelected("abc")` — redundant

With `loopGuard: { key: id => id }`:

- Step 3 is suppressed because key `"abc"` matches the last dispatched key

### Lifecycle

The adapter registers an `onDisconnect` hook on the runtime. When `runtime.disconnect()` is called, the store subscription is removed automatically. Calling the returned disconnect function also removes the subscription and cleans up the `onDisconnect` hook.

## Typical Usage Pattern

```typescript
import { connectExternalSnapshot } from "@tdreyno/fizz"

// In machine initialization or a React effect
const disconnect = connectExternalSnapshot({
  runtime,
  subscribe: onChange => store.subscribe(onChange),
  read: () => store.getState(),
  select: state => ({
    viewportMode: state.viewportMode,
    currentPage: state.currentPage,
  }),
  toAction: ShellStoreSnapshotReceived,
  equality: (a, b) =>
    a.viewportMode === b.viewportMode && a.currentPage === b.currentPage,
  emitInitial: true,
})

// runtime.disconnect() will also clean up the store subscription
```

## When to Use vs. Alternatives

| Situation                                        | Recommended approach                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| Wiring an external store to a machine            | `connectExternalSnapshot`                                          |
| Subscribing to Fizz context changes from outside | `runtime.onContextChange(fn)`                                      |
| Feeding machine output back to an external store | `runtime.onOutput(fn)` or `runtime.connectOutputChannel(handlers)` |
| Runtime-scoped subscription with auto-teardown   | `subscription(key, subscribe)` resource inside a state             |

## Related References

- `core-runtime.md` — Runtime class interface and action dispatch
- `output-actions.md` — Routing machine output back to the external world
- `resources.md` — State-scoped subscription resources inside machines
