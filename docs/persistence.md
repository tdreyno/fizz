# Persistence

State machines are often the longest-lived part of an app's logic, but the runtime that hosts them dies with the page. Reloads, SSR handoffs, and offline-first flows all need a way to capture where a machine is and put it back later. Fizz's snapshot API solves this: `getSnapshot` captures a runtime's current state plus bounded history as a plain JSON-safe object, and `restoreRuntime` rebuilds a live runtime from it.

```text
running runtime                          fresh process
┌────────────────┐   getSnapshot    ┌──────────────────┐
│ Runtime        │ ───────────────▶ │ RuntimeSnapshot   │
│  history:      │                  │  { version: 1,    │
│   [Cur, Prev]  │                  │    history: [...] │──▶ serializeSnapshot ──▶ storage
└────────────────┘                  └──────────────────┘
                                             │
storage ──▶ parseSnapshot ──▶ restoreRuntime(machine, snapshot)
                                             │
                                             ▼
                                    live Runtime at Cur
                                    (enter() re-run by default)
```

## What a snapshot contains

`getSnapshot(runtime)` walks the runtime's history (newest first) and records each entry's state `name`, its `data`, and its `mode` (`"append"` vs `"update"`), so `goBack()` behavior survives a round-trip. Live handles — nested runtimes, parallel branch runtimes, state resources — are never serialized directly; nested and parallel children are recursively captured as child snapshots instead.

```ts
interface RuntimeSnapshot {
  version: 1
  machineName?: string
  history: StateSnapshot[] // newest first; history[0] is the current state
}

interface StateSnapshot {
  name: string
  data: unknown
  mode: "append" | "update"
  nested?: RuntimeSnapshot
  parallel?: Record<string, RuntimeSnapshot>
}
```

Because restore looks up states by name, persistence effectively requires **named states**: pass `{ name: "..." }` to `state(...)` (auto-generated `AnonymousState` names are not stable across processes).

## Worked example: save on change, restore on boot

This example persists a small cart machine to `localStorage` whenever its context changes, and restores it on the next page load.

```ts
import type { ActionCreatorType, Enter } from "@tdreyno/fizz"
import {
  action,
  createMachine,
  createRuntime,
  enter,
  getSnapshot,
  parseSnapshot,
  restoreRuntime,
  serializeSnapshot,
  state,
} from "@tdreyno/fizz"

const addItem = action("AddItem").withPayload<string>()
type AddItem = ActionCreatorType<typeof addItem>

const Shopping = state<Enter | AddItem, { items: string[] }>(
  {
    Enter: () => undefined,
    AddItem: (data, item) => Shopping({ items: [...data.items, item] }),
  },
  { name: "Shopping" },
)

const CartMachine = createMachine({
  actions: { addItem },
  initialState: Shopping({ items: [] }),
  states: { Shopping },
})

const STORAGE_KEY = "cart-snapshot"

const boot = async () => {
  const saved = localStorage.getItem(STORAGE_KEY)

  const runtime = saved
    ? await restoreRuntime(CartMachine, parseSnapshot(saved))
    : createRuntime(CartMachine, CartMachine.initialState)

  if (!saved) {
    await runtime.run(enter())
  }

  runtime.onContextChange(() => {
    localStorage.setItem(
      STORAGE_KEY,
      serializeSnapshot(getSnapshot(runtime, { maxHistory: 10 })),
    )
  })

  return runtime
}
```

`maxHistory: 10` caps how many history entries are captured (newest first). Omit it to capture everything the runtime kept.

## Restore lifecycle semantics

By default `restoreRuntime` re-runs the restored state's `enter()` lifecycle after rebuilding history:

```text
restoreRuntime(machine, snapshot)
  1. validate version + look up each history entry's state by name
  2. rebuild transitions:  machine.states[name](data)  (mode preserved)
  3. construct runtime from rebuilt history
  4. runLifecycle !== false ?  await runtime.run(enter())  : done
```

Re-running `enter()` is what re-establishes everything a snapshot cannot carry: timers, intervals, subscriptions, DOM listeners, in-flight fetches, and state resources. Pass `runLifecycle: false` only when the restored state's `Enter` handler has side effects you must not repeat — and be aware nested/parallel children are rebuilt _during_ enter, so they require the lifecycle run.

`restoreRuntime` also accepts the usual `createRuntime` options, including `maxHistory` to bound the restored runtime's ongoing history:

```ts
const runtime = await restoreRuntime(CartMachine, snapshot, {
  maxHistory: 10,
  runLifecycle: true,
})
```

If the snapshot references a state name the machine doesn't know, or the version doesn't match, restore throws `SnapshotRestoreError`.

## Nested machines

Snapshots recurse into a nested child runtime automatically. To restore, `stateWithNested` needs a way to look child states up by name — pass the child `states` map in its options:

```ts
const Parent = stateWithNested<Enter, ParentData>(
  {
    Enter: noop,
  },
  ChildA({ step: 0 }), // initial nested state
  { Advance: advance }, // forwarded actions
  {
    name: "Parent",
    states: { ChildA, ChildB }, // enables snapshot restore by name
  },
)
```

During restore, the parent's enter lifecycle rebuilds the child from the snapshotted child state (recursively) instead of `initialNestedState`. Without the `states` option, restoring a nested snapshot throws `SnapshotRestoreError` with guidance.

## Parallel machines

Parallel machines need no extra configuration: each branch is a full machine definition, so `getSnapshot` captures every branch runtime under `parallel`, and restore rebuilds each branch to its snapshotted state during the parallel state's enter. Actions broadcast to all branches as usual afterward.

## JSON helpers

`serializeSnapshot` / `parseSnapshot` wrap `JSON.stringify` / `JSON.parse` with shape and version validation. For non-JSON-safe state data (Maps, Sets, custom classes), pass a `replacer`/`reviver` pair:

```ts
const json = serializeSnapshot(snapshot, {
  replacer: (_key, value) =>
    value instanceof Map ? { __map: [...value.entries()] } : value,
})

const restored = parseSnapshot(json, {
  reviver: (_key, value) =>
    value !== null && typeof value === "object" && "__map" in value
      ? new Map((value as { __map: [unknown, unknown][] }).__map)
      : value,
})
```

Note: `Date` values are converted by `Date.prototype.toJSON` _before_ a replacer sees them — revive them by key in the reviver, or store timestamps as numbers.

## What snapshots do not capture (v1)

- **In-flight async, pending timers/intervals/debounces** — re-derived by re-running `enter()` on restore
- **State resources** (`setStateResource`) — re-created by lifecycle
- **Storage adapters** — where and when to persist is the caller's job (see the example above)

If you want continuous two-way sync with an external store rather than save/restore checkpoints, see [Store Sync Adapter](./store-sync-adapter.md) (`connectExternalSnapshot`).

## Related Docs

- [Architecture](./architecture.md) — transition semantics and lifecycle ordering
- [Nested State Machines](./nested-state-machines.md)
- [Parallel State Machines](./parallel-state-machines.md)
- [Store Sync Adapter](./store-sync-adapter.md) — continuous external-store sync
- [API Documentation](./api.md) — exact signatures
