---
"@tdreyno/fizz": minor
---

Runtime performance overhaul (Phase 3). Multi-machine frame-budget scenarios are
now 9–13% faster than before, fire-and-forget burst dispatch is ~21% faster, and
queue construction is ~51% cheaper. These wins come from a synchronous drain
path in the queue runner, sync-capable command execution, closure dedup in the
state wrapper, and an O(n) rewrite of `toResourcesRecord`.

**Breaking changes** (observable):

- `await runtime.run(action)` now resolves only after all transitively-triggered
  work in the same drain has completed. Previously, intermediate microtask
  yields between commands meant that nested-triggered actions could still be
  pending when `run()` resolved. Code that relied on observing intermediate
  states between `await run()` and the next event loop tick should switch to
  using a controlled async/timer driver, or assert on the final settled state.
- `onContextChange` subscribers are now coalesced per `run()`: subscribers fire
  once at the end of a drain with the final state, rather than once per
  in-drain update. Code that counted intermediate change events will see fewer
  callbacks (one per `run()` call instead of one per `update(...)`).
