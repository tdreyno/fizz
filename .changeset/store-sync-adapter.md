---
"@tdreyno/fizz": minor
---

Add `connectExternalSnapshot()` for standardized external store wiring.

New API:

- `connectExternalSnapshot(options)` — subscribes to an external store, selects a snapshot slice, and dispatches a Fizz action whenever the snapshot changes
- `ConnectExternalSnapshotOptions<StoreState, Snapshot>` — typed options interface

Built-in behaviors:

- distinct-until-changed via configurable `equality` (defaults to `Object.is`)
- optional `emitInitial` to dispatch on first connect
- optional `loopGuard` to suppress re-dispatch when a machine write-back produces the same snapshot key
- auto-cleanup when `runtime.disconnect()` is called
