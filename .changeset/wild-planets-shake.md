---
"@tdreyno/fizz": minor
---

Add persistence/snapshot restore: `getSnapshot`, `restoreRuntime`, `serializeSnapshot`, and `parseSnapshot` capture a runtime's current state plus bounded history as a JSON-safe object and rehydrate it later (page reload, SSR handoff, offline storage). Snapshots recurse into nested machines (via a new `states` option on `stateWithNested`) and parallel machine branches. `restoreRuntime` supports `runLifecycle` (default `true`, re-runs `enter()` so timers/async re-establish) and `maxHistory` to bound the restored runtime's history. Restore failures throw the new `SnapshotRestoreError`.
