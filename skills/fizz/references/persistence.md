# Persistence (Snapshot / Restore)

Use this reference when the task involves saving a runtime's state and restoring it later: page reload, SSR handoff, offline storage, or checkpoint/undo systems.

## Export Surface

```typescript
import {
  getSnapshot,
  parseSnapshot,
  restoreRuntime,
  serializeSnapshot,
  SnapshotRestoreError,
  type GetSnapshotOptions,
  type ParseSnapshotOptions,
  type RestoreRuntimeOptions,
  type RuntimeSnapshot,
  type SerializeSnapshotOptions,
  type StateSnapshot,
} from "@tdreyno/fizz"
```

## Mental Model

A snapshot is a plain JSON-safe capture of the runtime's history, newest-first (`history[0]` is the current state). Each entry stores `{ name, data, mode }` so `goBack()` semantics survive a round-trip. Live handles (nested runtimes, parallel branch runtimes, resources, timers, in-flight async) are **never** serialized — nested and parallel children are recursively captured as child snapshots; everything else is re-derived by re-running `enter()` on restore.

```typescript
interface RuntimeSnapshot {
  version: 1
  machineName?: string
  history: StateSnapshot[] // newest first
}

interface StateSnapshot {
  name: string
  data: unknown
  mode: "append" | "update"
  nested?: RuntimeSnapshot
  parallel?: Record<string, RuntimeSnapshot>
}
```

## API

### `getSnapshot(runtime, options?): RuntimeSnapshot`

| Option        | Type     | Default | Description                                 |
| ------------- | -------- | ------- | ------------------------------------------- |
| `maxHistory`  | `number` | all     | Cap captured history entries (newest first) |
| `machineName` | `string` | none    | Label stored on the snapshot for consumers  |

### `restoreRuntime(machine, snapshot, options?): Promise<Runtime>`

Rebuilds each history entry via the machine's `states` map (lookup by state name), constructs a runtime, then re-runs `enter()` unless `runLifecycle: false`. Accepts all `createRuntime` options (e.g. `maxHistory` to bound the restored runtime's ongoing history).

| Option         | Type      | Default | Description                           |
| -------------- | --------- | ------- | ------------------------------------- |
| `runLifecycle` | `boolean` | `true`  | Re-run the restored state's `enter()` |
| `maxHistory`   | `number`  | none    | Bound the restored runtime's history  |
| ...            |           |         | Any other `createRuntime` option      |

Throws `SnapshotRestoreError` on unknown state name, bad version, or shape problems.

### `serializeSnapshot(snapshot, options?): string` / `parseSnapshot(json, options?): RuntimeSnapshot`

JSON helpers with shape + version validation. Options: `replacer`/`space` for serialize, `reviver` for parse — use them for Maps/Sets/custom classes. `Date.prototype.toJSON` runs _before_ a replacer sees the value; revive dates by key or store timestamps as numbers.

## Rules

- **States must be named**: restore looks up `machine.states` by name; auto-generated `AnonymousState` names are not stable across processes. Always pass `{ name: "..." }` to `state(...)`.
- **Nested restore requires a `states` lookup**: pass `states: { ChildA, ChildB }` in the `stateWithNested(...)` options object; otherwise restoring a snapshot with a `nested` entry throws `SnapshotRestoreError`.
- **Parallel machines need no configuration**: branches are full machine definitions, so branch restore works by name automatically.
- **Nested/parallel restore happens during `enter()`**: do not pass `runLifecycle: false` for machines with nested or parallel states.
- **Storage is the caller's job**: persist via `runtime.onContextChange(...)` + `serializeSnapshot(getSnapshot(runtime))`; no built-in adapters.

## Decision Tree

- Save/restore checkpoints across page loads or processes → this API (`getSnapshot` / `restoreRuntime`)
- Continuous two-way sync with a live external store (Redux, Zustand) → `connectExternalSnapshot` (see [store-sync-adapter.md](store-sync-adapter.md))
- Only need to re-read current state in-process → `runtime.currentState()`; no snapshot needed

## Minimal Pattern

```typescript
// save
runtime.onContextChange(() => {
  localStorage.setItem(
    "snap",
    serializeSnapshot(getSnapshot(runtime, { maxHistory: 10 })),
  )
})

// restore on boot
const saved = localStorage.getItem("snap")
const runtime = saved
  ? await restoreRuntime(Machine, parseSnapshot(saved))
  : createRuntime(Machine, Machine.initialState)
if (!saved) await runtime.run(enter())
```

## Error Handling

Wrap `parseSnapshot` + `restoreRuntime` in try/catch for `SnapshotRestoreError` and fall back to a fresh runtime — snapshots from older app versions may reference renamed states.
