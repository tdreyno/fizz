---
"@tdreyno/fizz": minor
---

Add two runtime behavior upgrades to `@tdreyno/fizz`:

- DOM listener coalescing in `@tdreyno/fizz/browser` via `dom.listen(..., { coalesce })` with support for `"none"`, `"animation-frame"`, and `"microtask"`.
- Latest-only keyed command scheduling for command effects via `commandEffect(..., { latestOnlyKey })` and `commandChannel(...).command(..., { latestOnlyKey })`, so pending same-key commands in the same channel are replaced by the newest queued command.

These updates improve high-frequency UI event handling and reduce stale queued imperative command work.
