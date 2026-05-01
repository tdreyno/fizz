---
"@tdreyno/fizz": minor
---

Add command-channel ergonomics for imperative command effects.

- Add `commandChannel(...)` helper for channel-bound command creation.
- Add `commandChannel(...).command(type, payload)` as a DRY wrapper over `commandEffect(...)`.
- Add `commandChannel(...).batch(commands, options?)` as a DRY wrapper over `effectBatch(...)` with bound channel.
- Keep behavior unchanged from existing `commandEffect(...)` + `effectBatch(...)` runtime semantics.
