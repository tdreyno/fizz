---
"@tdreyno/fizz": minor
---

# Resource Bridge

Add fluent resource-event bridging to state-scoped resources.

- Extend `resource(...)` with `.bridge(options)` and `.chainToAction(resolve, reject?)`.
- Add runtime support for bridge event delivery with optional `latest` and `{ debounceMs }` pacing.
- Keep bridge subscription lifecycle runtime-owned and state-scoped, including teardown and pending work cancellation on exit.
- Document the bridge API in core docs and skill references.