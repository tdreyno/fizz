---
"@tdreyno/fizz": minor
---

Add typed DOM listener convenience helpers on resource builders, mapping valid `addEventListener` keys to `onX` methods.

Examples:

- `dom.document().onMouseDown(handler)`
- `dom.window().onResize(handler)`
- `dom.history().onPopState(handler)`
- `dom.location().onHashChange(handler)`

Each helper is type-safe per target event map and delegates to `.listen(...)` with the matching event name.
